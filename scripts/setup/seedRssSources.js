/**
 * seedRssSources()
 * Run ONCE from Apps Script to populate the SOURCES sheet
 * Safe - clears old sources and inserts fresh complete list
 * 
 * How to run:
 * 1. Open Apps Script in your Google Sheet
 * 2. Paste this function alongside your existing code
 * 3. Select seedRssSources from the function dropdown
 * 4. Click Run
 * 5. Done - check your SOURCES sheet
 */
function seedRssSources() {
  const sheet = SpreadsheetApp.getActive().getSheetByName("SOURCES")

  // Clear existing data (except header row)
  const lastRow = sheet.getLastRow()
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 6).clearContent()
  }

  const data = [
    // ── WORLD ──────────────────────────────────────────────
    ["world-reuters",        "Reuters World",              "https://feeds.reuters.com/reuters/worldNews",                            "World",       true, ""],
    ["world-bbc",            "BBC World",                  "https://feeds.bbci.co.uk/news/world/rss.xml",                           "World",       true, ""],
    ["world-aljazeera",      "Al Jazeera",                 "https://www.aljazeera.com/xml/rss/all.xml",                             "World",       true, ""],
    ["world-guardian",       "Guardian World",             "https://www.theguardian.com/world/rss",                                 "World",       true, ""],
    ["world-un",             "UN News",                    "https://news.un.org/feed/subscribe/en/news/all/rss.xml",                "World",       true, ""],
    ["world-dw",             "DW World",                   "https://rss.dw.com/xml/rss-en-world",                                   "World",       true, ""],
    ["world-france24",       "France 24",                  "https://www.france24.com/en/rss",                                       "World",       true, ""],
    ["world-euronews",       "Euronews",                   "https://www.euronews.com/rss?level=theme&name=news",                    "World",       true, ""],

    // ── TECHNOLOGY ─────────────────────────────────────────
    ["tech-bbc",             "BBC Technology",             "https://feeds.bbci.co.uk/news/technology/rss.xml",                      "Technology",  true, ""],
    ["tech-guardian",        "Guardian Technology",        "https://www.theguardian.com/uk/technology/rss",                        "Technology",  true, ""],
    ["tech-techcrunch",      "TechCrunch",                 "https://techcrunch.com/feed/",                                          "Technology",  true, ""],
    ["tech-arstechnica",     "Ars Technica",               "https://feeds.arstechnica.com/arstechnica/index",                       "Technology",  true, ""],
    ["tech-verge",           "The Verge",                  "https://www.theverge.com/rss/index.xml",                                "Technology",  true, ""],
    ["tech-wired",           "Wired",                      "https://www.wired.com/feed/rss",                                        "Technology",  true, ""],
    ["tech-mit",             "MIT Tech Review",            "https://www.technologyreview.com/feed/",                                "Technology",  true, ""],
    ["tech-hackernews",      "Hacker News",                "https://hnrss.org/frontpage",                                           "Technology",  true, ""],

    // ── SCIENCE ────────────────────────────────────────────
    ["science-bbc",          "BBC Science",                "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",         "Science",     true, ""],
    ["science-nasa",         "NASA News",                  "https://www.nasa.gov/news-release/feed/",                               "Science",     true, ""],
    ["science-guardian",     "Guardian Science",           "https://www.theguardian.com/science/rss",                               "Science",     true, ""],
    ["science-daily",        "Science Daily",              "https://www.sciencedaily.com/rss/all.xml",                              "Science",     true, ""],
    ["science-mit",          "MIT News",                   "https://news.mit.edu/rss/research",                                     "Science",     true, ""],
    ["science-newscientist", "New Scientist",              "https://www.newscientist.com/feed/home/",                               "Science",     true, ""],
    ["science-physorg",      "Phys.org",                   "https://phys.org/rss-feed/",                                            "Science",     true, ""],
    ["science-eurekalert",   "EurekAlert",                 "https://www.eurekalert.org/rss.xml",                                    "Science",     true, ""],

    // ── BUSINESS ───────────────────────────────────────────
    ["business-bbc",         "BBC Business",               "https://feeds.bbci.co.uk/news/business/rss.xml",                        "Business",    true, ""],
    ["business-reuters",     "Reuters Business",           "https://feeds.reuters.com/reuters/businessNews",                         "Business",    true, ""],
    ["business-guardian",    "Guardian Business",          "https://www.theguardian.com/business/rss",                              "Business",    true, ""],
    ["business-cnbc",        "CNBC Business",              "https://www.cnbc.com/id/10001147/device/rss/rss.html",                  "Business",    true, ""],
    ["business-ft",          "Financial Times",            "https://www.ft.com/rss/home",                                           "Business",    false, ""],

    // ── HEALTH ─────────────────────────────────────────────
    ["health-bbc",           "BBC Health",                 "https://feeds.bbci.co.uk/news/health/rss.xml",                          "Health",      true, ""],
    ["health-who",           "WHO News",                   "https://www.who.int/feeds/entity/mediacentre/news/en/rss.xml",          "Health",      true, ""],
    ["health-reuters",       "Reuters Health",             "https://feeds.reuters.com/reuters/healthNews",                           "Health",      true, ""],
    ["health-nih",           "NIH News",                   "https://www.nih.gov/feeds.xml",                                         "Health",      true, ""],
    ["health-medxpress",     "Medical Xpress",             "https://medicalxpress.com/rss-feed/",                                   "Health",      true, ""],

    // ── ENVIRONMENT ────────────────────────────────────────
    ["env-guardian",         "Guardian Environment",       "https://www.theguardian.com/environment/rss",                           "Environment", true, ""],
    ["env-bbc",              "BBC Environment",            "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",         "Environment", true, ""],
    ["env-climatenews",      "Climate Home News",          "https://www.climatechangenews.com/feed/",                               "Environment", true, ""],
    ["env-carbonbrief",      "Carbon Brief",               "https://www.carbonbrief.org/feed",                                      "Environment", false, ""],

    // ── POLITICS ───────────────────────────────────────────
    ["politics-bbc",         "BBC Politics",               "https://feeds.bbci.co.uk/news/politics/rss.xml",                        "Politics",    true, ""],
    ["politics-reuters",     "Reuters Politics",           "https://feeds.reuters.com/Reuters/PoliticsNews",                         "Politics",    true, ""],
    ["politics-npr",         "NPR Politics",               "https://feeds.npr.org/1014/rss.xml",                                    "Politics",    true, ""],
    ["politics-thehill",     "The Hill",                   "https://thehill.com/feed/",                                             "Politics",    true, ""],

    // ── SPORTS ─────────────────────────────────────────────
    ["sports-bbc",           "BBC Sport",                  "https://feeds.bbci.co.uk/sport/rss.xml",                                "Sports",      true, ""],
    ["sports-guardian",      "Guardian Sport",             "https://www.theguardian.com/uk/sport/rss",                              "Sports",      true, ""],
    ["sports-espn",          "ESPN Headlines",             "https://www.espn.com/espn/rss/news",                                    "Sports",      true, ""],

    // ── ENTERTAINMENT ──────────────────────────────────────
    ["ent-bbc",              "BBC Entertainment",          "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",          "Entertainment", true, ""],
    ["ent-guardian",         "Guardian Culture",           "https://www.theguardian.com/culture/rss",                               "Entertainment", true, ""],

    // ── SPACE ──────────────────────────────────────────────
    ["space-nasa",           "NASA Breaking News",         "https://www.nasa.gov/rss/dyn/breaking_news.rss",                        "Space",       true, ""],
    ["space-spacecom",       "Space.com",                  "https://www.space.com/feeds/all",                                       "Space",       true, ""],
    ["space-nsf",            "NASASpaceFlight",            "https://www.nasaspaceflight.com/feed/",                                 "Space",       true, ""],
    ["space-esa",            "ESA News",                   "https://www.esa.int/rssfeed/Our_Activities/Space_News",                 "Space",       false, ""],
  ]

  // Write all sources starting from row 2
  sheet.getRange(2, 1, data.length, data[0].length).setValues(data)

  // Summary log
  const categories = {}
  data.forEach(row => {
    const cat = row[3]
    categories[cat] = (categories[cat] || 0) + 1
  })

  Logger.log("✅ SOURCES sheet populated with " + data.length + " sources:\n")
  Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => Logger.log("  " + cat + ": " + count + " sources"))

  Logger.log("\n💡 Set column E to FALSE to disable any source")
  Logger.log("💡 Financial Times and a few others are disabled by default (may have limited RSS)")

  SpreadsheetApp.getUi().alert(
    "✅ Done! " + data.length + " sources added to SOURCES sheet.\n\n" +
    "Check the Execution Log for a breakdown by category."
  )
}
