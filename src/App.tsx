// src/App.tsx
import React, { useEffect, useState } from "react";

interface Job {
  id: number;
  title: string;
  company: string;
  url: string;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");   // <-- NEW
  const [status, setStatus] = useState("Checking login…");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [backendData, setBackendData] = useState<any>(null);

  /* ---- AUTH CHECK ---- */
  const checkAuth = async () => {
    const response = await chrome.runtime.sendMessage({ action: "CHECK_AUTH" });
    setAuthenticated(response.authenticated);
    setUserEmail(response.email ?? "");
    setStatus(response.authenticated ? "Ready" : "Login required");
  };

  useEffect(() => {
    checkAuth();
    // re-check when cookies change
    const listener = () => checkAuth();
    chrome.cookies.onChanged.addListener(listener);
    return () => chrome.cookies.onChanged.removeListener(listener);
  }, []);

  /* ---- FILE UPLOAD ---- */
  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f?.type === "application/pdf") {
      setResumeFile(f);
      setStatus(`Uploaded: ${f.name}`);
    } else {
      setStatus("Please upload a PDF");
    }
  };

  /* ---- SCRAPE ---- */
  const scrape = async () => {
    setStatus("Scraping…");
    const r = await chrome.runtime.sendMessage({ action: "START_JOB_ANALYSIS" });
    if (r.jobs?.length) {
      setJobs(r.jobs);
      setStatus(`Found ${r.jobs.length} job(s)`);
    } else {
      setStatus("No jobs found");
    }
  };

  /* ---- SEND TO BACKEND ---- */
  const send = async () => {
    if (!resumeFile || !jobs.length) return setStatus("Upload + scrape first");
    setLoading(true);
    setStatus("Sending…");
    const buf = await resumeFile.arrayBuffer();
    chrome.runtime.sendMessage(
      {
        action: "SEND_TO_BACKEND",
        resumeBuffer: Array.from(new Uint8Array(buf)),
        resumeName: resumeFile.name,
        urls: jobs.slice(0, 3).map((j) => j.url),
      },
      (resp) => {
        setLoading(false);
        if (resp.success) {
          setBackendData(resp.data);
          setStatus("Done");
        } else {
          setStatus(`Error: ${resp.error}`);
          setAuthenticated(false);
        }
      }
    );
  };

  /* ---- UI ---- */
  if (authenticated === null) return <div className="p-4">Loading…</div>;

  if (!authenticated) {
    return (
      <div className="p-4 w-[400px] bg-gray-50 rounded-xl shadow-md text-center">
        <h2 className="text-xl font-bold text-red-600 mb-3">Login Required</h2>
        <p className="text-sm text-gray-600 mb-4">
          Please log in on Career Compass.
        </p>
        <button
          onClick={() => chrome.tabs.create({ url: "http://localhost:5173/login" })}
          className="w-full py-2 bg-indigo-600 text-white rounded"
        >
          Open Login
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 w-[400px] bg-gray-50 rounded-xl shadow-md">
      <h2 className="text-2xl font-bold text-indigo-700 text-center mb-1">
        AI Job Matcher
      </h2>

      {/* USER EMAIL */}
      {userEmail && (
        <p className="text-sm font-medium text-indigo-600 text-center -mt-1 mb-3">
          Logged in as: {userEmail}
        </p>
      )}

      <input type="file" accept="application/pdf" onChange={upload} className="w-full mb-3" />

      <button onClick={scrape} className="w-full py-2 bg-indigo-600 text-white rounded mb-2">
        Scrape Jobs
      </button>

      <button
        onClick={send}
        disabled={loading}
        className="w-full py-2 bg-green-600 text-white rounded disabled:bg-gray-400"
      >
        {loading ? "Processing…" : "Send to Backend"}
      </button>

      <p className="mt-2 text-sm text-center text-gray-600">{status}</p>

      {/* JOBS LIST */}
      {jobs.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold mb-2">Scraped Jobs:</h3>
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li key={j.id} className="border p-2 rounded bg-white shadow-sm">
                <a href={j.url} target="_blank" className="text-indigo-600 font-medium">
                  {j.title}
                </a>
                <p className="text-xs text-gray-500">{j.company}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* BACKEND RESULT */}
      {backendData && (
        <div className="mt-4 bg-white p-3 rounded shadow">
          <h3 className="font-bold text-green-700 mb-2">AI Results</h3>
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
            {JSON.stringify(backendData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}