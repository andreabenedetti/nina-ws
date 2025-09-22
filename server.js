const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
app.use(cors());

app.use(express.static(path.join(__dirname, ".")));

const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_MODEL_VERSION =
  "15a3689ee13b0d2616e98820eca31d4c3abcd36672df6afce5cb6feb1d66087d";

let currentImage = null;
let currentPrompt = "a landscape in the style of Van Gogh";

// Funzione di polling asincrona NON BLOCCANTE
async function pollPrediction(predictionId) {
  const maxAttempts = 180; // 60 secondi max
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        attempts++;
        if (attempts > maxAttempts) {
          reject(new Error("Timeout: predizione troppo lunga"));
          return;
        }

        const res = await axios.get(
          `https://api.replicate.com/v1/predictions/${predictionId}`,
          {
            headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
            timeout: 5000, // 5 secondi timeout per ogni richiesta
          },
        );

        const status = res.data.status;
        console.log(`Prediction ${predictionId} status: ${status}`);

        if (status === "succeeded") {
          resolve(res.data.output[0]);
          return;
        }

        if (status === "failed") {
          reject(new Error("Predizione fallita"));
          return;
        }

        // Continua il polling dopo 1 secondo (non bloccante)
        setTimeout(poll, 1000);
      } catch (err) {
        console.error(
          "Errore polling predizione:",
          err.response?.data || err.message,
        );
        reject(err);
      }
    };

    // Inizia il polling
    poll();
  });
}

// Genera immagine AI (restituisce Base64)
async function generateImageWithAI(imageBase64, prompt) {
  try {
    const imageDataUri = `data:image/png;base64,${imageBase64}`;

    console.log("Invio richiesta a Replicate...");
    const res = await axios.post(
      "https://api.replicate.com/v1/predictions",
      {
        version: REPLICATE_MODEL_VERSION,
        input: {
          image: imageDataUri,
          prompt,
          prompt_strength: 0.9,
          num_inference_steps: 30,
          guidance_scale: 11,
        },
      },
      {
        headers: {
          Authorization: `Token ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 secondi timeout
      },
    );

    const predictionId = res.data.id;
    console.log(`Predizione creata: ${predictionId}`);

    return await pollPrediction(predictionId);
  } catch (err) {
    console.error("Errore generazione AI:", err.response?.data || err.message);
    throw err;
  }
}

// Socket.IO
io.on("connection", (socket) => {
  console.log(`Nuovo utente connesso: ${socket.id}`);

  const userColor = [
    Math.floor(Math.random() * 255),
    Math.floor(Math.random() * 255),
    Math.floor(Math.random() * 255),
    255,
  ];

  socket.emit("assignColor", userColor);
  if (currentImage) socket.emit("generatedImage", currentImage);

  // Disegno
  socket.on("drawStroke", (data) => {
    socket.broadcast.emit("drawStroke", data); // Invia solo agli altri utenti
  });

  socket.on("canvasImage", (data) => {
    currentImage = data;
  });

  // Generazione AI completamente asincrona
  socket.on("generateImage", async ({ image, prompt }) => {
    console.log(`Generazione immagine richiesta da ${socket.id}`);

    try {
      // Genera l'immagine senza bloccare altri eventi
      const generatedImage = await generateImageWithAI(image, prompt);

      if (generatedImage) {
        currentImage = generatedImage;
        io.emit("generatedImage", generatedImage);
        console.log("Immagine generata e inviata a tutti i client");
      } else {
        socket.emit("errorMessage", "Errore generazione immagine");
      }
    } catch (err) {
      console.error("Errore nella generazione:", err);
      socket.emit(
        "errorMessage",
        "Errore generazione immagine: " + err.message,
      );
    }
  });

  // Prompt
  socket.on("changePrompt", (newPrompt) => {
    currentPrompt = newPrompt;
    socket.broadcast.emit("promptUpdated", currentPrompt); // Non rimandare a chi l'ha inviato
  });

  // Pulizia canvas
  socket.on("clearCanvas", () => {
    currentImage = null;
    io.emit("clearCanvas");
  });

  socket.on("disconnect", () => {
    console.log(`Utente disconnesso: ${socket.id}`);
  });
});

// Gestione errori del server
server.on("error", (err) => {
  console.error("Errore server:", err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`Server in ascolto su http://localhost:${PORT}`),
);
