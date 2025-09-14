import React from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ProtectedRoute() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");

  useEffect(() => {
    // 初回セッション確認
    supabase.auth.getSession().then(({ data }) => {
      setState(data.session ? "in" : "out");
    });

    // 以降の変化も反映
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setState(session ? "in" : "out");
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  if (state === "loading") {
    return <div className="wrap"><div className="skeleton">チェック中...</div></div>;
  }
  if (state === "out") {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
