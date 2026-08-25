const express = require("express");
const videos = require("../data/videos.json");

const router = express.Router();

// GET /api/videos — the House's video channel (events, reviews, content)
// To add a new video: append an object to backend/data/videos.json with
// { id, title, description, provider: "youtube"|"vimeo"|"mp4",
//   videoId, thumbnail, publishedAt } and restart the server.
router.get("/", (req, res) => {
  const sorted = [...videos].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  res.json(sorted);
});

module.exports = router;
