// src/App.tsx
import { useEffect, useState } from "react";
import {
  Loader2,
  FileText,
  Briefcase,
  Brain,
  Download,
  Mail,
  Phone,
} from "lucide-react";

interface Job {
  id: number;
  title: string;
  company: string;
  url: string;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState("");

  const [status, setStatus] = useState("Checking login…");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [backendData, setBackendData] = useState<any>(null);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [resumeBuffer, setResumeBuffer] = useState<Uint8Array | null>(null);
  const [resumeName, setResumeName] = useState("");

  // ---- AUTH ----
  const checkAuth = async () => {
    const r = await chrome.runtime.sendMessage({ action: "CHECK_AUTH" });
    setAuthenticated(r.authenticated);
    setUserEmail(r.email ?? "");
    setStatus(r.authenticated ? "Ready" : "Login required");
  };

  useEffect(() => {
    checkAuth();
    const listener = () => checkAuth();
    chrome.cookies.onChanged.addListener(listener);
    return () => chrome.cookies.onChanged.removeListener(listener);
  }, []);

  // ---- FETCH RESUME ----
  const fetchResume = async () => {
    setStatus("Fetching resume…");
    const res = await chrome.runtime.sendMessage({ action: "FETCH_RESUME" });
    if (res.success) {
      const buffer = new Uint8Array(res.resumeBuffer);
      const blob = new Blob([buffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setResumeBuffer(buffer);
      setResumeName(res.resumeName);
      setDisplayName(res.displayName);
      setPdfUrl(url);
      setStatus("Resume fetched");
    } else {
      setPdfUrl(null);
      setDisplayName("");
      setResumeBuffer(null);
      setResumeName("");
      setStatus("No resume found on server");
    }
  };

  // ---- SCRAPE JOBS ----
  const scrape = async () => {
    setStatus("Scraping jobs…");
    const r = await chrome.runtime.sendMessage({ action: "START_JOB_ANALYSIS" });
    if (r.jobs?.length) {
      setJobs(r.jobs);
      setStatus(`Found ${r.jobs.length} job(s)`);
    } else {
      setStatus("No jobs found");
    }
  };

  // ---- SEND TO AI ----
  const send = async () => {
    if (!resumeBuffer || !jobs.length) return setStatus("Fetch + scrape first");
    setLoading(true);
    setStatus("Sending to AI…");

    chrome.runtime.sendMessage(
      {
        action: "SEND_TO_BACKEND",
        resumeBuffer: Array.from(resumeBuffer),
        resumeName,
        urls: jobs.slice(0, 3).map((j) => j.url),
      },
      (resp) => {
        setLoading(false);
        if (resp.success) {
          setBackendData(resp.data);
          setStatus("AI Done!");
        } else {
          setStatus(`Error: ${resp.error}`);
        }
      }
    );
  };

  // ---- Render Helper for AI Result ----
  const renderAIResult = () => {
    const data = backendData;
    if (!data) return null;
    const profile = data.candidate_profile;
    const jobs = data.matched_jobs || [];

    return (
      <div className="mt-3 space-y-4">
        {/* Candidate Profile */}
        <div className="bg-white p-3 rounded-xl border shadow-sm">
          <h3 className="text-lg font-semibold text-indigo-700 mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Candidate Profile
          </h3>
          <p className="font-medium text-gray-800">{profile.name}</p>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Mail className="w-3 h-3" /> {profile.email}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <Phone className="w-3 h-3" /> {profile.phone}
          </div>

          <p className="text-sm text-gray-700 mb-2">
            {profile.experience_summary}
          </p>

          <div className="text-xs mt-2">
            <p className="font-semibold text-gray-700">Skills:</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {profile.skills.map((s: string) => (
                <span
                  key={s}
                  className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-2 text-xs">
            <p className="font-semibold text-gray-700">Education:</p>
            {profile.education.map((e: any, idx: number) => (
              <div key={idx} className="mt-1 ml-2">
                🎓 {e.degree}, {e.school} ({e.dates})
              </div>
            ))}
          </div>

          {profile.certifications?.length > 0 && (
            <div className="mt-2 text-xs">
              <p className="font-semibold text-gray-700">Certifications:</p>
              <ul className="list-disc ml-5 text-gray-600">
                {profile.certifications.map((c: string, i: number) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Matched Jobs */}
        <div className="bg-white p-3 rounded-xl border shadow-sm">
          <h3 className="text-lg font-semibold text-indigo-700 mb-2 flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> Matched Jobs
          </h3>

          {jobs.map((job: any, i: number) => (
            <div
              key={i}
              className="border rounded-lg p-2 mb-2 bg-gray-50 hover:bg-gray-100"
            >
              <div className="flex justify-between items-center">
                <a
                  href={job.job_url}
                  target="_blank"
                  className="font-medium text-indigo-700 hover:underline"
                >
                  {job.job_title || "Unknown Role"}
                </a>
                <span className="text-sm text-gray-500">
                  Score: {(job.match_score * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-1">
                {job.company || "Unknown Company"}
              </p>
              <p className="text-xs text-gray-700 mb-2 whitespace-pre-line">
                {job.summary}
              </p>

              <div className="flex flex-wrap gap-1">
                {job.key_matches.map((k: string) => (
                  <span
                    key={k}
                    className="px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded-full"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ---- MAIN RETURN ----
  if (authenticated === null)
    return (
      <div className="p-6 flex items-center justify-center text-gray-600">
        <Loader2 className="animate-spin mr-2" /> Loading…
      </div>
    );

  if (!authenticated)
    return (
      <div className="p-6 w-[420px] bg-white rounded-2xl shadow text-center">
        <h2 className="text-xl font-semibold text-red-600 mb-3">
          Login Required
        </h2>
        <button
          onClick={() => chrome.tabs.create({ url: "https://career-compass-lyart-ten.vercel.app/" })}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Open Login Page
        </button>
      </div>
    );

  return (
    <div className="p-5 w-[420px] bg-gray-50 rounded-2xl shadow-lg text-sm space-y-4 overflow-y-auto max-h-[90vh]">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-indigo-700">AI Job Matcher</h1>
        <p className="text-gray-600 text-xs">Logged in as {userEmail}</p>
      </header>

      {/* Step 1: Resume */}
      <section className="bg-white p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="text-indigo-600" />
          <h3 className="font-semibold text-indigo-700">1. Resume</h3>
        </div>

        {!displayName ? (
          <button
            onClick={fetchResume}
            className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Fetch Resume
          </button>
        ) : (
          <div>
            <div className="flex justify-between items-center bg-green-50 px-3 py-2 rounded">
              <span className="text-green-700 text-sm font-medium">
                {displayName}
              </span>
              <a
                href={pdfUrl!}
                download={displayName}
                className="text-xs flex items-center bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
              >
                <Download className="w-3 h-3 mr-1" /> Download
              </a>
            </div>
            {pdfUrl && (
              <iframe
                src={pdfUrl}
                title="Resume"
                className="w-full h-60 mt-2 border rounded"
              />
            )}
          </div>
        )}
      </section>

      {/* Step 2: Job Scraper */}
      <section className="bg-white p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Briefcase className="text-indigo-600" />
          <h3 className="font-semibold text-indigo-700">2. Scrape Jobs</h3>
        </div>
        <button
          onClick={scrape}
          className="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Scrape Current Page
        </button>

        {jobs.length > 0 && (
          <ul className="mt-2 max-h-32 overflow-y-auto text-xs space-y-1">
            {jobs.map((j) => (
              <li
                key={j.id}
                className="border p-2 rounded bg-gray-50 hover:bg-gray-100"
              >
                <a
                  href={j.url}
                  target="_blank"
                  className="text-indigo-600 font-medium"
                >
                  {j.title}
                </a>{" "}
                <span className="text-gray-500">– {j.company}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Step 3: AI Matching */}
      <section className="bg-white p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="text-indigo-600" />
          <h3 className="font-semibold text-indigo-700">3. AI Match Analysis</h3>
        </div>
        <button
          onClick={send}
          disabled={loading || !resumeBuffer}
          className="w-full py-2 bg-green-600 text-white rounded disabled:opacity-50 hover:bg-green-700"
        >
          {loading ? (
            <span className="flex justify-center items-center gap-2">
              <Loader2 className="animate-spin w-4 h-4" /> Analyzing…
            </span>
          ) : (
            "Analyze Matches"
          )}
        </button>

        {backendData && renderAIResult()}
      </section>

      <footer className="text-center text-gray-500 text-xs">{status}</footer>
    </div>
  );
}
