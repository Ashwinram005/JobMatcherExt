// src/background.ts
import { firebaseConfig } from "./firebase";

const LOGIN_URL = "http://localhost:5173/login";

chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.windowId !== undefined) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

/**
 * Returns { isAuth: true/false, email: string|undefined }
 * Uses Firebase REST API to verify the ID token stored in the cookie.
 */
async function isAuthenticated(): Promise<{ isAuth: boolean; email?: string }> {
  const cookie = await chrome.cookies.get({
    url: "http://localhost:5173",
    name: "ext_auth",
  });

  if (!cookie) return { isAuth: false };

  try {
    const idToken = cookie.value;
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!res.ok) return { isAuth: false };
    const data = await res.json();

    const user = data.users?.[0];
    return { isAuth: true, email: user?.email ?? "Unknown" };
  } catch (e) {
    console.error("Token verification failed:", e);
    return { isAuth: false };
  }
}

/* ---------- MESSAGE HANDLER ---------- */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    /* ---- CHECK_AUTH ---- */
    if (msg.action === "CHECK_AUTH") {
      const result = await isAuthenticated();
      sendResponse({
        authenticated: result.isAuth,
        email: result.email,
      });
      return;
    }

    /* ---- ENSURE_AUTH ---- */
    if (msg.action === "ENSURE_AUTH") {
      if (!(await isAuthenticated()).isAuth) {
        chrome.tabs.create({ url: LOGIN_URL });
      }
      sendResponse({ ok: true });
      return;
    }

    /* ---- START_JOB_ANALYSIS ---- */
    if (msg.action === "START_JOB_ANALYSIS") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return sendResponse({ jobs: [] });
      const resp: any = await chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_JOBS" });
      sendResponse({ jobs: resp?.jobs ?? [] });
      return;
    }

    /* ---- SEND_TO_BACKEND ---- */
    if (msg.action === "SEND_TO_BACKEND") {
      if (!(await isAuthenticated()).isAuth) {
        return sendResponse({ success: false, error: "Login required" });
      }
      try {
        const buffer = new Uint8Array(msg.resumeBuffer);
        const fd = new FormData();
        fd.append("resume", new Blob([buffer]), msg.resumeName);
        msg.urls.forEach((u: string) => fd.append("urls[]", u));

        const res = await fetch(
          "https://sound-guiding-mammoth.ngrok-free.app/api/match-jobs",
          { method: "POST", body: fd }
        );
        const data = await res.json();
        sendResponse({ success: true, data });
      } catch (e) {
        sendResponse({ success: false, error: String(e) });
      }
      return;
    }
  })();

  return true; // keep the channel open for async responses
});