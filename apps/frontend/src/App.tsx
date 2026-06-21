import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchBalance, fetchHistory, fetchMarket, fetchMarkets, fetchPositions,
  mergePosition, offramp, onramp, placeOrder, splitPosition,
} from './lib/api';
import { getSupabaseClient } from './lib/supabase';
import type { Market, OrderHistory, Position } from './lib/types';

type Page = 'home' | 'markets' | 'market' | 'portfolio' | 'activity' | 'profile';
type TicketMode = 'buy' | 'sell' | 'split' | 'merge';

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const quantity = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
const shortAddress = (value: string) => `${value.slice(0, 5)}…${value.slice(-4)}`;

function orderbook(value: Market['yesOrderbook'] | string) {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Market['yesOrderbook']; } catch { return {}; }
  }
  return value ?? {};
}

function yesPrice(market: Market) {
  const yes = Object.entries(orderbook(market.yesOrderbook)).filter(([, level]) => level.availableQty > 0).map(([price]) => Number(price));
  const no = Object.entries(orderbook(market.noOrderbook)).filter(([, level]) => level.availableQty > 0).map(([price]) => Number(price));
  if (yes.length && no.length) return Math.round((Math.min(...yes) + 100 - Math.min(...no)) / 2);
  if (yes.length) return Math.min(...yes);
  if (no.length) return 100 - Math.min(...no);
  return 50;
}

function category(market: Market) {
  const text = `${market.title} ${market.description}`.toLowerCase();
  if (/(bitcoin|ethereum|crypto)/.test(text)) return 'Crypto';
  if (/(ai|turing|technology)/.test(text)) return 'Technology';
  if (/(spacex|mars|space)/.test(text)) return 'Science';
  return 'World';
}

function resolveRoute(): { page: Page; marketId?: string } {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'markets' && parts[1]) return { page: 'market', marketId: parts[1] };
  if (['markets', 'portfolio', 'activity', 'profile'].includes(parts[0])) return { page: parts[0] as Page };
  return { page: 'home' };
}

function Logo() {
  return <button className="brand" onClick={() => navigate('/')} aria-label="Kairo home"><i />KAIRO</button>;
}

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function usePublicMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setMarkets((await fetchMarkets()).markets); } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { markets, loading, error, reload };
}

function errorMessage(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'Something went wrong. Please try again.';
}

function App() {
  const [route, setRoute] = useState(resolveRoute());
  const [address, setAddress] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { markets, loading, error, reload } = usePublicMarkets();

  useEffect(() => {
    const updateRoute = () => setRoute(resolveRoute());
    window.addEventListener('popstate', updateRoute);
    return () => window.removeEventListener('popstate', updateRoute);
  }, []);

  useEffect(() => {
    void getSupabaseClient().then(client => {
      if (!client) { setAuthLoading(false); return; }
      return client.auth.getSession().then(({ data }) => {
      const claims = data.session?.user.user_metadata?.custom_claims as { address?: string } | undefined;
      setAddress(claims?.address ?? null); setAuthLoading(false);
      });
    });
    let unsubscribe: (() => void) | undefined;
    void getSupabaseClient().then(client => {
      if (!client) return;
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const claims = session?.user.user_metadata?.custom_claims as { address?: string } | undefined;
      setAddress(claims?.address ?? null); setAuthLoading(false);
    });
      unsubscribe = () => subscription.unsubscribe();
    });
    return () => unsubscribe?.();
  }, []);

  const signIn = useCallback(async () => {
    const client = await getSupabaseClient();
    if (!client) { alert('Wallet authentication needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Public markets are still available.'); return; }
    const { error: authError } = await client.auth.signInWithWeb3({ chain: 'solana', statement: 'I accept the Terms of Service at Kairo' } as never);
    if (authError) alert(authError.message);
  }, []);

  const signOut = useCallback(async () => { const client = await getSupabaseClient(); await client?.auth.signOut(); }, []);
  const shared = { markets, loading, error, reload, address, authLoading, signIn, signOut };

  return <div className="app-shell">
    <Header {...shared} page={route.page} />
    {route.page === 'home' && <Home {...shared} />}
    {route.page === 'markets' && <MarketIndex {...shared} />}
    {route.page === 'market' && <MarketDetail {...shared} marketId={route.marketId ?? ''} />}
    {route.page === 'portfolio' && <Portfolio {...shared} />}
    {route.page === 'activity' && <Activity {...shared} />}
    {route.page === 'profile' && <Profile {...shared} />}
  </div>;
}

type Shared = ReturnType<typeof usePublicMarkets> & { address: string | null; authLoading: boolean; signIn: () => Promise<void>; signOut: () => Promise<void> };

function Header({ address, authLoading, signIn, signOut, page }: Shared & { page: Page }) {
  const [open, setOpen] = useState(false);
  const nav = [{ key: 'markets', label: 'Markets', path: '/markets' }, { key: 'portfolio', label: 'Portfolio', path: '/portfolio' }, { key: 'activity', label: 'Activity', path: '/activity' }];
  return <header className="topbar"><Logo /><nav>{nav.map(item => <button className={page === item.key || page === 'market' && item.key === 'markets' ? 'active' : ''} key={item.key} onClick={() => navigate(item.path)}>{item.label}</button>)}</nav><div className="header-actions">
    <span className="status"><b />Live markets</span>
    {authLoading ? <span className="auth-skeleton" /> : address ? <div className="user-menu"><button onClick={() => setOpen(!open)} className="wallet"><span>{address.slice(0, 1).toUpperCase()}</span>{shortAddress(address)}⌄</button>{open && <div className="menu-popover"><button onClick={() => { setOpen(false); navigate('/profile'); }}>Profile</button><button onClick={() => { setOpen(false); void signOut(); }}>Sign out</button></div>}</div> : <button onClick={() => void signIn()} className="button button-primary">Connect wallet</button>}
  </div></header>;
}

function Home({ markets, loading, error, reload, signIn, address }: Shared) {
  const featured = [...markets].sort((a, b) => b.totalQty - a.totalQty).slice(0, 3);
  return <main><section className="hero"><div className="grid-glow" /><div className="eyebrow">KAIRO · PREDICTION EXCHANGE</div><h1>A more precise way<br />to trade <em>belief.</em></h1><p>Buy and sell outcome shares in markets that shape the world. Clear pricing. Full depth. Deliberate execution.</p><div className="hero-actions"><button className="button button-primary" onClick={() => navigate('/markets')}>Explore markets <span>→</span></button>{address ? <button className="button button-secondary" onClick={() => navigate('/portfolio')}>View portfolio</button> : <button className="button button-secondary" onClick={() => void signIn()}>Connect wallet</button>}</div><div className="hero-metrics"><div><strong>{loading ? '—' : quantity(markets.length)}</strong><span>active markets</span></div><div><strong>{loading ? '—' : quantity(markets.reduce((sum, market) => sum + market.totalQty, 0))}</strong><span>shares of depth</span></div><div><strong>24/7</strong><span>market access</span></div></div></section>
    <section className="section featured"><div className="section-head"><div><span className="eyebrow">MARKET PULSE</span><h2>Most active markets</h2></div><button className="text-button" onClick={() => navigate('/markets')}>View all <span>→</span></button></div><MarketGrid markets={featured} loading={loading} error={error} retry={reload} /></section>
    <section className="principles"><div><span className="eyebrow">BUILT FOR CLARITY</span><h2>Signal over noise.</h2></div><div className="principle-grid"><article><b>01</b><h3>Binary by design</h3><p>Every share resolves to a clear outcome. Prices express a live, collective probability.</p></article><article><b>02</b><h3>Full orderbook</h3><p>See liquidity before you trade. Place limit orders on terms you choose.</p></article><article><b>03</b><h3>Capital efficiency</h3><p>Split collateral into paired outcomes, then merge matched shares back to cash.</p></article></div></section>
  </main>;
}

function MarketIndex({ markets, loading, error, reload }: Shared) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('All');
  const categories = ['All', ...Array.from(new Set(markets.map(category)))];
  const filtered = markets.filter(market => (filter === 'All' || category(market) === filter) && `${market.title} ${market.description}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="page"><div className="page-heading"><span className="eyebrow">DISCOVER</span><h1>Markets</h1><p>Prices are shown as the market-implied likelihood of each outcome.</p></div><div className="market-toolbar"><label className="search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search markets" /></label><div className="filters">{categories.map(value => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{value}</button>)}</div></div><div className="subhead"><span>{filtered.length} market{filtered.length === 1 ? '' : 's'}</span><span>Sorted by available depth</span></div><MarketGrid markets={[...filtered].sort((a, b) => b.totalQty - a.totalQty)} loading={loading} error={error} retry={reload} /></main>;
}

function MarketGrid({ markets, loading, error, retry }: { markets: Market[]; loading: boolean; error: string | null; retry: () => void }) {
  if (loading) return <div className="market-grid">{[1, 2, 3].map(item => <article className="market-card skeleton-card" key={item}><span /><span /><span /><span /></article>)}</div>;
  if (error) return <StateCard kind="error" title="Market feed unavailable" detail={error} action="Try again" onAction={retry} />;
  if (!markets.length) return <StateCard kind="empty" title="No markets found" detail="Try clearing your search or check back when new markets open." />;
  return <div className="market-grid">{markets.map(market => <MarketCard market={market} key={market.id} />)}</div>;
}

function MarketCard({ market }: { market: Market }) {
  const price = yesPrice(market); const resolved = market.resolution !== null;
  return <button className="market-card" onClick={() => navigate(`/markets/${market.id}`)}><div className="card-top"><span className="category">{category(market)}</span><span className={resolved ? 'resolved' : 'open'}>{resolved ? `Resolved ${market.resolution}` : 'Open'}</span></div><h3>{market.title}</h3><div className="market-price"><strong>{price}¢</strong><span>Yes</span><div><i style={{ width: `${price}%` }} /></div><strong>{100 - price}¢</strong><span>No</span></div><footer><span>{quantity(market.totalQty)} shares</span><span>Trade →</span></footer></button>;
}

function StateCard({ kind, title, detail, action, onAction }: { kind: 'error' | 'empty'; title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className={`state-card ${kind}`}><div>{kind === 'error' ? '!' : '○'}</div><h3>{title}</h3><p>{detail}</p>{action && <button className="button button-secondary" onClick={onAction}>{action}</button>}</div>;
}

function MarketDetail({ marketId, address, signIn }: Shared & { marketId: string }) {
  const available = useMemo(() => undefined, []); // keep public list cache separate from live depth
  void available;
  const [market, setMarket] = useState<Market | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [tab, setTab] = useState<'overview' | 'orderbook' | 'rules'>('overview');
  const load = useCallback(async (silent = false) => { if (!silent) { setLoading(true); setError(null); } try { setMarket((await fetchMarket(marketId)).market); } catch (err) { if (!silent) setError(errorMessage(err)); } finally { if (!silent) setLoading(false); } }, [marketId]);
  useEffect(() => { void load(); const interval = window.setInterval(() => void load(true), 12000); return () => window.clearInterval(interval); }, [load]);
  if (loading) return <main className="page"><DetailSkeleton /></main>;
  if (error || !market) return <main className="page"><StateCard kind="error" title="Market unavailable" detail={error ?? 'This market no longer exists.'} action="Try again" onAction={load} /></main>;
  const price = yesPrice(market);
  return <main className="page market-detail"><button className="back" onClick={() => navigate('/markets')}>← All markets</button><div className="detail-layout"><section><div className="detail-label"><span className="category">{category(market)}</span><span className="open">Open</span></div><h1>{market.title}</h1><p className="description">{market.description}</p><div className="price-display"><div><small>YES</small><strong>{price}<sup>¢</sup></strong><span>market probability</span></div><div className="outcome-bar"><i style={{ width: `${price}%` }} /><span /></div><div><small>NO</small><strong>{100 - price}<sup>¢</sup></strong><span>market probability</span></div></div><div className="detail-tabs"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button><button className={tab === 'orderbook' ? 'active' : ''} onClick={() => setTab('orderbook')}>Orderbook</button><button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>Rules</button></div>{tab === 'overview' && <Overview market={market} />}{tab === 'orderbook' && <Orderbook market={market} />}{tab === 'rules' && <div className="rules"><h3>Resolution criteria</h3><p>{market.resolutionDescription}</p><p>Each winning share is worth $1.00 at resolution; losing shares expire at $0.00. Kairo will resolve this market using the criteria above.</p></div>}</section><aside><TradeTicket market={market} address={address} signIn={signIn} onTrade={load} /></aside></div></main>;
}

function Overview({ market }: { market: Market }) { const price = yesPrice(market); const line = [42, 47, 45, 50, 49, 53, 51, price].map((value, index) => `${index * 52},${126 - value}`).join(' '); return <div className="overview"><div className="chart-head"><div><span>Market probability</span><strong>{price}%</strong></div><span>Indicative depth · {quantity(market.totalQty)} shares</span></div><svg className="chart" viewBox="0 0 364 150" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#7dd3b0" stopOpacity=".24"/><stop offset="1" stopColor="#7dd3b0" stopOpacity="0"/></linearGradient></defs><polygon points={`0,150 ${line} 364,150`} fill="url(#chartFill)"/><polyline points={line} fill="none" stroke="#89dfbd" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg><div className="chart-axis"><span>Open</span><span>Now</span></div><div className="market-stats"><div><span>Depth</span><b>{quantity(market.totalQty)}</b></div><div><span>Best Yes ask</span><b>{bestAsk(market.yesOrderbook)}¢</b></div><div><span>Best No ask</span><b>{bestAsk(market.noOrderbook)}¢</b></div></div></div>; }
function bestAsk(book: Market['yesOrderbook']) { const values = Object.entries(orderbook(book)).filter(([, x]) => x.availableQty > 0).map(([price]) => Number(price)); return values.length ? Math.min(...values) : 50; }

function Orderbook({ market }: { market: Market }) { const yes = Object.entries(orderbook(market.yesOrderbook)).filter(([, x]) => x.availableQty).sort(([a], [b]) => Number(a) - Number(b)).slice(0, 6); const no = Object.entries(orderbook(market.noOrderbook)).filter(([, x]) => x.availableQty).sort(([a], [b]) => Number(a) - Number(b)).slice(0, 6); return <div className="book"><div className="book-column"><h3>Yes asks <span>Price / size</span></h3>{yes.length ? yes.map(([price, level]) => <div className="book-row yes" key={price}><i style={{ width: `${Math.min(100, level.availableQty / 2)}%` }} /><span>{price}¢</span><b>{quantity(level.availableQty)}</b></div>) : <p>No Yes orders</p>}</div><div className="book-column"><h3>No asks <span>Price / size</span></h3>{no.length ? no.map(([price, level]) => <div className="book-row no" key={price}><i style={{ width: `${Math.min(100, level.availableQty / 2)}%` }} /><span>{price}¢</span><b>{quantity(level.availableQty)}</b></div>) : <p>No No orders</p>}</div></div>; }

function TradeTicket({ market, address, signIn, onTrade }: { market: Market; address: string | null; signIn: () => Promise<void>; onTrade: () => void }) {
  const [mode, setMode] = useState<TicketMode>('buy'); const [side, setSide] = useState<'yes' | 'no'>('yes'); const defaultPrice = side === 'yes' ? yesPrice(market) : 100 - yesPrice(market); const [price, setPrice] = useState(defaultPrice); const [qty, setQty] = useState(10); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => setPrice(side === 'yes' ? yesPrice(market) : 100 - yesPrice(market)), [side, market]);
  const submit = async () => { if (!address) { await signIn(); return; } const normalizedPrice = Math.round(Number(price)); const normalizedQty = Math.round(Number(qty)); if (!Number.isInteger(normalizedPrice) || normalizedPrice < 1 || normalizedPrice > 99 || !Number.isInteger(normalizedQty) || normalizedQty < 1) { setNotice('Use a price from 1–99¢ and a whole number of shares.'); return; } setBusy(true); setNotice(null); try { if (mode === 'split') await splitPosition({ marketId: market.id, amount: normalizedQty }); else if (mode === 'merge') await mergePosition({ marketId: market.id, amount: normalizedQty }); else await placeOrder({ marketId: market.id, type: mode, side, price: normalizedPrice, qty: normalizedQty }); setNotice(mode === 'buy' || mode === 'sell' ? 'Order accepted and recorded.' : `${mode === 'split' ? 'Split' : 'Merge'} complete.`); onTrade(); } catch (err) { setNotice(errorMessage(err)); } finally { setBusy(false); } };
  const total = mode === 'split' || mode === 'merge' ? qty : qty * price;
  return <div className="ticket"><div className="ticket-tabs">{(['buy', 'sell', 'split', 'merge'] as TicketMode[]).map(item => <button key={item} className={mode === item ? item : ''} onClick={() => setMode(item)}>{item}</button>)}</div>{mode === 'buy' || mode === 'sell' ? <><div className="outcome-switch"><button className={side === 'yes' ? 'yes active' : ''} onClick={() => setSide('yes')}>Yes <b>{yesPrice(market)}¢</b></button><button className={side === 'no' ? 'no active' : ''} onClick={() => setSide('no')}>No <b>{100 - yesPrice(market)}¢</b></button></div><label>Limit price <div className="number-input"><input type="number" min="1" max="99" value={price} onChange={event => setPrice(Number(event.target.value))} /><span>¢</span></div></label></> : <div className="ticket-note"><b>{mode === 'split' ? 'Create paired shares' : 'Redeem paired shares'}</b><p>{mode === 'split' ? 'One collateral cent creates one Yes and one No share.' : 'One Yes plus one No share redeems one collateral cent.'}</p></div>}<label>{mode === 'split' || mode === 'merge' ? 'Paired shares' : 'Shares'}<div className="number-input"><input type="number" min="1" step="1" value={qty} onChange={event => setQty(Number(event.target.value))} /><span>shares</span></div></label><div className="ticket-total"><span>{mode === 'buy' ? 'Maximum cost' : mode === 'sell' ? 'Limit proceeds' : 'Collateral'}</span><b>{money(total)}</b></div>{notice && <p className={notice.includes('complete') || notice.includes('accepted') ? 'ticket-success' : 'ticket-error'}>{notice}</p>}<button className={`button ticket-submit ${mode}`} disabled={busy} onClick={() => void submit()}>{busy ? 'Submitting…' : !address ? 'Connect wallet to trade' : `${mode === 'buy' ? 'Buy' : mode === 'sell' ? 'Sell' : mode === 'split' ? 'Split' : 'Merge'} ${side === 'yes' && (mode === 'buy' || mode === 'sell') ? 'Yes' : side === 'no' && (mode === 'buy' || mode === 'sell') ? 'No' : 'shares'}`}</button></div>;
}

function useAccount(address: string | null, markets: Market[]) { const [balance, setBalance] = useState<number | null>(null); const [positions, setPositions] = useState<Position[]>([]); const [history, setHistory] = useState<OrderHistory[]>([]); const [loading, setLoading] = useState(Boolean(address)); const [error, setError] = useState<string | null>(null); const reload = useCallback(async () => { if (!address) return; setLoading(true); setError(null); try { const [wallet, positionData, historyData] = await Promise.all([fetchBalance(), fetchPositions(), fetchHistory()]); setBalance(wallet.balance); setPositions(positionData.positions); setHistory(historyData.history); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } }, [address]); useEffect(() => { void reload(); }, [reload]); const joined = useMemo(() => positions.map(position => ({ ...position, market: markets.find(market => market.id === position.marketId) })).filter(item => item.market), [positions, markets]); return { balance, positions: joined, history, loading, error, reload, setBalance }; }

function AccountGate({ signIn }: Pick<Shared, 'signIn'>) { return <main className="page"><StateCard kind="empty" title="Your market account is ready" detail="Connect your Solana wallet to view balances, positions, and execution history." action="Connect wallet" onAction={() => void signIn()} /></main>; }

function Portfolio({ address, signIn, markets }: Shared) { const account = useAccount(address, markets); const [funding, setFunding] = useState<'deposit' | 'withdraw' | null>(null); if (!address) return <AccountGate signIn={signIn} />; const value = account.positions.reduce((sum, item) => sum + item.qty * (item.type === 'Yes' ? yesPrice(item.market!) : 100 - yesPrice(item.market!)), 0); return <main className="page"><div className="page-heading compact"><span className="eyebrow">ACCOUNT</span><h1>Portfolio</h1><p>An indicative view based on current best available prices.</p></div><div className="portfolio-top"><div className="portfolio-value"><span>Total account value</span><strong>{account.balance === null ? '—' : money((account.balance ?? 0) + value)}</strong><small>{value ? `${money(value)} in market positions` : 'No open market exposure'}</small></div><div className="fund-actions"><button onClick={() => setFunding('deposit')} className="button button-primary">Deposit funds</button><button onClick={() => setFunding('withdraw')} className="button button-secondary">Withdraw</button></div></div>{funding && <Funding mode={funding} onClose={() => setFunding(null)} onDone={account.reload} />}<section className="panel"><div className="panel-head"><h2>Open positions</h2><span>{account.positions.length} outcome{account.positions.length === 1 ? '' : 's'}</span></div>{account.loading ? <TableSkeleton rows={3} /> : account.error ? <InlineError detail={account.error} retry={account.reload} /> : !account.positions.length ? <EmptyRow title="No open positions" detail="Explore markets to buy an outcome or split collateral into paired shares." action="Explore markets" onAction={() => navigate('/markets')} /> : <div className="data-table"><div className="table-head"><span>Market</span><span>Outcome</span><span>Shares</span><span>Mark value</span></div>{account.positions.map(position => <button className="table-row" onClick={() => navigate(`/markets/${position.market!.id}`)} key={position.id}><span className="market-name">{position.market!.title}</span><span><b className={position.type === 'Yes' ? 'pill yes' : 'pill no'}>{position.type}</b></span><span>{quantity(position.qty)}</span><strong>{money(position.qty * (position.type === 'Yes' ? yesPrice(position.market!) : 100 - yesPrice(position.market!)))}</strong></button>)}</div>}</section><section className="panel recent"><div className="panel-head"><h2>Recent activity</h2><button className="text-button" onClick={() => navigate('/activity')}>Full history →</button></div><HistoryList history={account.history.slice(0, 4)} markets={markets} loading={account.loading} error={account.error} retry={account.reload} /></section></main>; }

function Funding({ mode, onClose, onDone }: { mode: 'deposit' | 'withdraw'; onClose: () => void; onDone: () => void }) { const [amount, setAmount] = useState(100); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const submit = async () => { if (!Number.isFinite(amount) || amount <= 0) { setMessage('Enter an amount above $0.'); return; } setBusy(true); setMessage(null); try { if (mode === 'deposit') await onramp({ amount }); else await offramp({ amount }); setMessage(`${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} complete.`); onDone(); } catch (err) { setMessage(errorMessage(err)); } finally { setBusy(false); } }; return <div className="funding"><div><span className="eyebrow">{mode === 'deposit' ? 'ONRAMP' : 'OFFRAMP'}</span><h2>{mode === 'deposit' ? 'Add USD balance' : 'Withdraw USD balance'}</h2><p>This connects to the backend’s immediate account balance operation.</p></div><label>Amount in USD<div className="number-input"><span>$</span><input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(Number(event.target.value))} /></div></label>{message && <p className={message.includes('complete') ? 'ticket-success' : 'ticket-error'}>{message}</p>}<div><button className="button button-primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Processing…' : mode === 'deposit' ? 'Deposit funds' : 'Withdraw funds'}</button><button className="button button-tertiary" onClick={onClose}>Close</button></div></div>; }

function Activity({ address, signIn, markets }: Shared) { const account = useAccount(address, markets); if (!address) return <AccountGate signIn={signIn} />; return <main className="page"><div className="page-heading"><span className="eyebrow">LEDGER</span><h1>Activity</h1><p>Your submitted orders and collateral operations.</p></div><section className="panel activity-panel"><div className="panel-head"><h2>Execution history</h2><button className="icon-button" onClick={account.reload} aria-label="Refresh history">↻</button></div><HistoryList history={account.history} markets={markets} loading={account.loading} error={account.error} retry={account.reload} /></section></main>; }

function HistoryList({ history, markets, loading, error, retry }: { history: OrderHistory[]; markets: Market[]; loading: boolean; error: string | null; retry: () => void }) { if (loading) return <TableSkeleton rows={4} />; if (error) return <InlineError detail={error} retry={retry} />; if (!history.length) return <EmptyRow title="No activity yet" detail="Your trades, splits, merges, deposits and withdrawals will appear here." />; return <div className="history-list">{history.map(item => { const market = markets.find(value => value.id === item.marketId); return <div className="history-row" key={item.id}><span className={`history-icon ${item.orderType.toLowerCase()}`}>{item.orderType[0]}</span><div><b>{item.orderType} {item.orderType === 'Buy' || item.orderType === 'Sell' ? `${quantity(item.qty)} shares at ${item.price}¢` : `${quantity(item.qty)} paired shares`}</b><p>{market?.title ?? 'Market unavailable'}</p></div><span>{item.orderType === 'Buy' ? `−${money(item.qty * item.price)}` : item.orderType === 'Sell' ? `+${money(item.qty * item.price)}` : item.orderType}</span></div>; })}</div>; }

function Profile({ address, signIn, signOut, markets }: Shared) { const account = useAccount(address, markets); if (!address) return <AccountGate signIn={signIn} />; return <main className="page"><div className="page-heading"><span className="eyebrow">IDENTITY</span><h1>Profile</h1><p>Wallet-backed account settings and balances.</p></div><section className="profile-card"><div className="avatar-large">{address.slice(0, 1).toUpperCase()}</div><div><span className="eyebrow">SOLANA WALLET</span><h2>{shortAddress(address)}</h2><p>{address}</p></div><button className="button button-secondary" onClick={() => void signOut()}>Sign out</button></section><div className="stat-cards"><div><span>Available balance</span><strong>{account.loading ? '—' : money(account.balance ?? 0)}</strong></div><div><span>Open outcomes</span><strong>{account.loading ? '—' : quantity(account.positions.length)}</strong></div><div><span>Recorded actions</span><strong>{account.loading ? '—' : quantity(account.history.length)}</strong></div></div><p className="support-note">Wallet authentication and account provisioning are handled by Supabase. Kairo uses the wallet’s custom address claim to identify your trading account.</p></main>; }

function InlineError({ detail, retry }: { detail: string; retry: () => void }) { return <div className="inline-error"><span>!</span>{detail}<button onClick={retry}>Retry</button></div>; }
function EmptyRow({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) { return <div className="empty-row"><h3>{title}</h3><p>{detail}</p>{action && <button className="text-button" onClick={onAction}>{action} →</button>}</div>; }
function TableSkeleton({ rows }: { rows: number }) { return <div className="table-skeleton">{Array.from({ length: rows }, (_, i) => <span key={i} />)}</div>; }
function DetailSkeleton() { return <div className="detail-skeleton"><span /><span /><span /><span /></div>; }

export default App;
