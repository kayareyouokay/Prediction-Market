import axios from "axios";
import { useSupabase } from "./useSupabase";
import { useUser } from "./useUser"

function App() {
  const { claims, setClaims } = useUser();
  const supabase = useSupabase();

  return (
    <>
      {!claims && <button onClick={async () => {
        await supabase.auth.signInWithWeb3({
          chain: 'solana',
          statement: 'I accept the Terms of Service at Kairo',
        })
      }}>Sign in with Solana</button>}

      {claims && <button onClick={async () => {
        await supabase.auth.signOut();
        setClaims(null);
      }}>Logout</button>}

      <button onClick={async () => {
        await supabase.auth.getSession()
          .then(response => {
            console.log(response.data.session?.access_token);
            axios.post("http://localhost:3000/buy", {}, {
              headers: {
                Authorization: response.data.session?.access_token
              }
            })
          })
      }}>Click here to buy</button>
    </>
  )
}

export default App
