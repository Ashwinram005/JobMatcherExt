  // src/background.ts
  import { firebaseConfig } from "./firebase";

  const LOGIN_URL = "http://localhost:5173";
  const RESUME_API_URL = "https://sound-guiding-mammoth.ngrok-free.app/api/firebase/resumes";

  chrome.action.onClicked.addListener(async (tab) => {
    if (tab?.windowId !== undefined) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });

  /* ---- CHECK AUTH ---- */
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

  /* ---- FETCH RESUME FROM FRIEND'S API ---- */
  // src/background.ts  (only the fetchResumeFromBackend function is updated)

  async function fetchResumeFromBackend(): Promise<{
    file: File;
    displayName: string;
  } | null> {
    const cookie = await chrome.cookies.get({
      url: "http://localhost:5173",
      name: "ext_auth",
    });
    if (!cookie) return null;

    try {
      const idToken = cookie.value;
      const payload = JSON.parse(atob(idToken.split(".")[1]));
      const userId = payload.sub ?? payload.user_id; // Firebase uses `sub`

      const res = await fetch(RESUME_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });

      if (!res.ok) {
        console.error("API error:", res.status, await res.text());
        return null;
      }

      const data = await res.json();

      // NEW: read the first resume from the array
      const resume = data.resumes?.[0];
      if (!resume?.content || !resume.name) {
        console.warn("No resume in response:", data);
        return null;
      }

      // ----- Base64 handling -----
      let base64 = resume.content;
      if (base64.startsWith("PDF_BASE64:")) {
        base64 = base64.replace(/^PDF_BASE64:/, "");
      }

      // Validate Base64 (optional but safe)
      if (!/^[\w+/=]+$/.test(base64)) {
        console.error("Invalid Base64");
        return null;
      }

      const binary = atob(base64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);

      const blob = new Blob([array], { type: "application/pdf" });

      // Clean filename
      const cleanName = resume.name
        .replace(/\s*\(PDF\)$/i, "")
        .replace(/\s*\(TXT\)$/i, "")
        .trim();
      const filename = `${cleanName}.pdf`;

      return { file: new File([blob], filename), displayName: resume.name };
    } catch (e) {
      console.error("fetchResumeFromBackend failed:", e);
      return null;
    }
  }

  /* ---- MESSAGE HANDLER ---- */
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg.action === "CHECK_AUTH") {
        const result = await isAuthenticated();
        sendResponse({ authenticated: result.isAuth, email: result.email });
        return;
      }

      if (msg.action === "FETCH_RESUME") {
        const result = await fetchResumeFromBackend();
        if (result) {
          const buffer = await result.file.arrayBuffer();
          sendResponse({
            success: true,
            resumeBuffer: Array.from(new Uint8Array(buffer)),
            resumeName: result.file.name,
            displayName: result.displayName,
          });
        } else {
          sendResponse({ success: false });
        }
        return;
      }

      if (msg.action === "ENSURE_AUTH") {
        if (!(await isAuthenticated()).isAuth) {
          chrome.tabs.create({ url: LOGIN_URL });
        }
        sendResponse({ ok: true });
        return;
      }

      if (msg.action === "START_JOB_ANALYSIS") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return sendResponse({ jobs: [] });
        const resp: any = await chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_JOBS" });
        sendResponse({ jobs: resp?.jobs ?? [] });
        return;
      }

      // src/background.ts  (replace the whole SEND_TO_BACKEND block)

if (msg.action === "SEND_TO_BACKEND") {
  if (!(await isAuthenticated()).isAuth) {
    return sendResponse({ success: false, error: "Login required" });
  }

  try {
    // 1. Resume → Blob
    const resumeBuffer = new Uint8Array(msg.resumeBuffer);
    const resumeBlob = new Blob([resumeBuffer], { type: "application/pdf" });

    // 2. Build FormData exactly like Python
    const fd = new FormData();

    // → pdf_file (field name expected by backend)
    fd.append("pdf_file", resumeBlob, msg.resumeName);

    // → json_body as JSON string
    const jsonBody = {
      urls: msg.urls,  // array of job URLs
    };
    fd.append("json_body", JSON.stringify(jsonBody));
    
    // 3. Send
    const res = await fetch(
      "https://sound-guiding-mammoth.ngrok-free.app/api/match-jobs",
      {
        method: "POST",
        body: fd,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    sendResponse({ success: true, data });

  } catch (e: any) {
    console.error("SEND_TO_BACKEND failed:", e);
    sendResponse({ success: false, error: e.message || String(e) });
  }
  return;
}
    })();

    return true;
  });