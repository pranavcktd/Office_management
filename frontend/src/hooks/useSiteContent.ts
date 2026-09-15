import { useEffect, useState } from "react";
import { api } from "../api/client";

export interface SiteContent {
  headerNotice: string | null;
  footerNotice: string | null;
  loginNotice: string | null;
}

/** Fetches the admin-editable header/footer/login notices — unauthenticated endpoint, safe to
 * call before sign-in (the login page) and after (the app shell). */
export function useSiteContent(): SiteContent | null {
  const [content, setContent] = useState<SiteContent | null>(null);

  useEffect(() => {
    api
      .get<SiteContent>("/public/system-contact")
      .then(({ data }) => setContent(data))
      .catch(() => setContent(null));
  }, []);

  return content;
}
