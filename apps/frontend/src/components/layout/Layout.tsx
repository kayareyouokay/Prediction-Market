/* ──────────────────────────────────────────────
   Kairo — Layout
   Root layout with Navbar, MobileNav, and Toast
   ────────────────────────────────────────────── */

import { useState, useCallback, type ReactNode } from "react";
import { Navbar } from "./Navbar";
import { MobileNav } from "./MobileNav";
import { ToastContainer } from "@/components/ui/Toast";
import "./Layout.css";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleMenuToggle = useCallback(() => {
    setMobileNavOpen((prev) => !prev);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

  return (
    <div className="layout">
      <Navbar onMenuToggle={handleMenuToggle} />
      <MobileNav isOpen={mobileNavOpen} onClose={handleMenuClose} />
      <main className="layout__main">{children}</main>
      <ToastContainer />
    </div>
  );
}
