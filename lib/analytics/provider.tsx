"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { analytics } from "./index";
const pages: readonly string[] = ["/","/other"];
export function AnalyticsProvider() {
  const pathname = usePathname() ?? "/";
  const [visible, setVisible] = useState(false);
  const [disabled, setDisabled] = useState(false);
  useEffect(() => {
    queueMicrotask(() => { setVisible(analytics.isHosted()); setDisabled(!analytics.isEnabled()); });
    const route = pages.find(template => {
      const segments = template.split("/");
      const actual = pathname.split("/");
      return segments.length === actual.length && segments.every((part,index) => part === actual[index] || (part.startsWith(":") && actual[index].length > 0));
    }) ?? "/other";
    analytics.page(route);
  }, [pathname]);
  if (!visible) return null;
  return <p style={{ fontSize: "0.75rem", padding: "0.75rem 1rem", textAlign: "center" }}>
    {disabled ? "Usage analytics is off." : <>Usage analytics records actions, without form or document content.{" "}<button type="button" onClick={() => { analytics.disable(); setDisabled(true); }} style={{ color: "inherit", background: "transparent", border: 0, textDecoration: "underline", cursor: "pointer" }}>Turn off</button></>}
  </p>;
}
