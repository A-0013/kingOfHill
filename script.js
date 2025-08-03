import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://vpmykikexelcdyqnnglf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbXlraWtleGVsY2R5cW5uZ2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5Mjc3MTcsImV4cCI6MjA2OTUwMzcxN30.Iq0daYRLeU3Jsamo3L70xpgTkMc5IhjYBZf-sxBBi14";
const supabase = createClient(supabaseUrl, supabaseKey);

let bars = [];
let currentMatch = {};
let ytApiLoaded = false;
let ytPlayer1, ytPlayer2;

// Load YouTube IFrame API
function loadYouTubeAPI(callback) {
  if (ytApiLoaded || (window.YT && window.YT.Player)) {
    ytApiLoaded = true;
    callback();
    return;
  }
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  window.onYouTubeIframeAPIReady = () => {
    ytApiLoaded = true;
    callback();
  };
  document.body.appendChild(tag);
}

// Extract YouTube video ID from a full link
function getVideoId(link) {
  const match = link.match(/(?:v=|\/embed\/|\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Embed YouTube players and stop after 5 seconds
function embedYouTubePlayers(link1, link2, ts1 = 0, ts2 = 0) {
  const videoId1 = getVideoId(link1);
  const videoId2 = getVideoId(link2);

  const player1Div = document.getElementById("player1");
  const player2Div = document.getElementById("player2");

  player1Div.innerHTML = videoId1 ? '<div id="ytplayer1"></div>' : "<p>Invalid YouTube link.</p>";
  player2Div.innerHTML = videoId2 ? '<div id="ytplayer2"></div>' : "<p>Invalid YouTube link.</p>";

  let timeout1, timeout2;

  if (videoId1) {
    ytPlayer1 = new YT.Player('ytplayer1', {
      height: '225',
      width: '400',
      videoId: videoId1,
      playerVars: { controls: 0, start: ts1 },
      events: {
        'onStateChange': (event) => {
          if (event.data === YT.PlayerState.PLAYING) {
            // Only seek if not already at the timestamp
            const currentTime = ytPlayer1.getCurrentTime();
            if (Math.abs(currentTime - ts1) > 0.5) {
              ytPlayer1.seekTo(ts1);
              return; // Wait for seek to finish before starting timer
            }
            clearTimeout(timeout1);
            timeout1 = setTimeout(() => ytPlayer1.stopVideo(), 5000);
          } else if (event.data === YT.PlayerState.ENDED || event.data === YT.PlayerState.PAUSED) {
            clearTimeout(timeout1);
          }
        }
      }
    });
  }
  if (videoId2) {
    ytPlayer2 = new YT.Player('ytplayer2', {
      height: '225',
      width: '400',
      videoId: videoId2,
      playerVars: { controls: 0, start: ts2 },
      events: {
        'onStateChange': (event) => {
          if (event.data === YT.PlayerState.PLAYING) {
            const currentTime = ytPlayer2.getCurrentTime();
            if (Math.abs(currentTime - ts2) > 0.5) {
              ytPlayer2.seekTo(ts2);
              return;
            }
            clearTimeout(timeout2);
            timeout2 = setTimeout(() => ytPlayer2.stopVideo(), 5000);
          } else if (event.data === YT.PlayerState.ENDED || event.data === YT.PlayerState.PAUSED) {
            clearTimeout(timeout2);
          }
        }
      }
    });
  }
}

async function fetchBars() {
  const { data, error } = await supabase.from("bars").select("*");
  if (error) return console.error(error);
  bars = data;
  loadMatch();
}

function calculateExpectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function updateELO(winnerRating, loserRating, K = 400) {
  const expectedWinner = calculateExpectedScore(winnerRating, loserRating);
  const expectedLoser = calculateExpectedScore(loserRating, winnerRating);
  return {
    winner: winnerRating + K * (1 - expectedWinner),
    loser: loserRating + K * (0 - expectedLoser),
  };
}

function loadMatch() {
  if (!bars || bars.length < 2) {
    document.getElementById("player1").innerHTML = "<p>No videos available.</p>";
    document.getElementById("player2").innerHTML = "<p>No videos available.</p>";
    return;
  }
  const shuffled = [...bars].sort(() => Math.random() - 0.5);
  currentMatch = { player1: shuffled[0], player2: shuffled[1] };
  loadYouTubeAPI(() => {
  embedYouTubePlayers(
    currentMatch.player1.link,
    currentMatch.player2.link,
    currentMatch.player1.timestamp || 0,
    currentMatch.player2.timestamp || 0
  );
});
  document.getElementById("keep-king").textContent = `Top is Worse (ELO: ${Math.round(currentMatch.player1.elo)})`;
  document.getElementById("new-king").textContent = `Bottom is Worse (ELO: ${Math.round(currentMatch.player2.elo)})`;
}

async function updateWinner(winner, loser) {
  const newRatings = updateELO(winner.elo, loser.elo);
  await supabase.from("bars").update({ elo: newRatings.winner }).eq("id", winner.id);
  await supabase.from("bars").update({ elo: newRatings.loser }).eq("id", loser.id);
  await fetchBars();
}

document.getElementById("keep-king").addEventListener("click", () => {
  updateWinner(currentMatch.player1, currentMatch.player2);
});

document.getElementById("new-king").addEventListener("click", () => {
  updateWinner(currentMatch.player2, currentMatch.player1);
});

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = document.getElementById("videoUrl").value;
  const timestamp = parseInt(document.getElementById("timestamp").value, 10) || 0;
  const videoId = getVideoId(url);
  if (!videoId) return alert("Invalid YouTube link");
  const { error } = await supabase.from("bars").insert({ link: url, timestamp, elo: 1200 });
  if (error) return console.error(error);
  document.getElementById("status").textContent = "Submitted!";
  fetchBars();
});

document.getElementById("show-leaderboard").addEventListener("click", () => {
  const leaderboard = document.getElementById("leaderboard");
  if (leaderboard.style.display === "none") {
    leaderboard.style.display = "block";
    leaderboard.innerHTML = bars
      .sort((a, b) => b.elo - a.elo)
      .map((bar, i) => `<p>${i + 1}. ${bar.link} - ${Math.round(bar.elo)}</p>`) 
      .join("");
  } else {
    leaderboard.style.display = "none";
  }
});

fetchBars();