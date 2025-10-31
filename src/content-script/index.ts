console.log("✅ Content script loaded");

function scrapeJobList() {
  const jobContainers = Array.from(document.querySelectorAll(".individual_internship"));
  const jobs = jobContainers.map((container, index) => {
    const titleAnchor = container.querySelector("h3.job-internship-name a.job-title-href");
    const companyElement = container.querySelector("p.company-name");

    const title = titleAnchor?.textContent?.trim() || "No Title";
    const company = companyElement?.textContent?.trim() || "No Company";
    const href = titleAnchor?.getAttribute("href") || "";
    const url = href.startsWith("http") ? href : `https://internshala.com${href}`;

    return { id: index, title, company, url };
  });

  console.log("✅ Jobs scraped:", jobs);
  return jobs;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "SCRAPE_JOBS") {
    const jobs = scrapeJobList();
    sendResponse({ jobs });
  }
  return true;
});
