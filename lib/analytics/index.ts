import { createAnalytics } from "./browser.js";
export const analytics = createAnalytics({
  "app": "immunologyscout-demo",
  "origins": [
    "https://immunologyscout-demo.vercel.app",
    "https://immunologyscout.musicofdanielnash.com",
    "https://immunologyscout-demo-danash1611-3756s-projects.vercel.app",
    "https://immunologyscout-demo-git-main-danash1611-3756s-projects.vercel.app"
  ],
  "previewPrefix": "immunologyscout-demo",
  "pages": [
    "/",
    "/other"
  ],
  "events": [
    "research_started",
    "research_completed"
  ]
});
