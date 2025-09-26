let socket;
let canvas;
let currentImage = null;
let isDrawing = false;
let userColor = [0, 0, 0, 255];
const bgColor = [
  Math.floor(Math.random() * 255),
  Math.floor(Math.random() * 255),
  Math.floor(Math.random() * 255),
  255,
];
let allDrawings = [];
console.log("Script caricato!");

function setup() {
  console.log("Setup iniziato!");
  try {
    canvas = createCanvas(430, 430);
    background(bgColor[0], bgColor[1], bgColor[2]);
    console.log("Canvas creato!", canvas);
    console.log("Background color:", bgColor);

    // Connessione socket
    socket = io("https://nina-ws.onrender.com");
    console.log("Socket inizializzato");

    // Ricevi tratti dagli altri utenti
    socket.on("drawStroke", (data) => {
      drawRemote(data);
      allDrawings.push(data);
    });

    socket.on("connect", () => console.log("Connesso al server Socket.IO!"));
    socket.on("disconnect", () =>
      console.log("Disconnesso dal server Socket.IO!"),
    );

    socket.on("assignColor", (color) => {
      userColor = color;
      console.log("Colore assegnato:", color);
    });

    socket.on("clearCanvas", () => {
      clear(); // Pulisce il canvas locale
    });

    socket.on("generatedImage", async (imageUrl) => {
      document.getElementById("status").textContent =
        "Nuova immagine generata dall'AI!";
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageUrl;
        img.onload = () => {
          clear();
          allDrawings = [];
          currentImage = createImage(img.width, img.height);
          currentImage.drawingContext.drawImage(img, 0, 0);
          redraw();
        };
      } catch (err) {
        console.error("Errore caricamento immagine AI:", err);
      }
    });

    socket.on("promptUpdated", (prompt) => {
      document.getElementById("promptInput").value = prompt;
    });

    // Funzione per gestire l'inizio del disegno (mouse o touch)
    function startDrawing(event) {
      isDrawing = true;
      console.log("Drawing started");
      event.preventDefault();
    }

    // Funzione per gestire la fine del disegno (mouse o touch)
    function stopDrawing(event) {
      if (isDrawing) {
        isDrawing = false;
        console.log("Drawing stopped");
        sendCanvasImage();
        event.preventDefault();
      }
    }

    // Funzione per gestire il movimento (mouse o touch)
    function moveDrawing(event) {
      if (isDrawing) {
        let x, y, px, py;
        if (event.type.includes("mouse")) {
          x = mouseX;
          y = mouseY;
          px = pmouseX;
          py = pmouseY;
        } else {
          const touch = event.touches[0];
          x = touch.clientX - canvas.elt.getBoundingClientRect().left;
          y = touch.clientY - canvas.elt.getBoundingClientRect().top;
          px = x - (event.touches[0].clientX - event.touches[0].clientX);
          py = y - (event.touches[0].clientY - event.touches[0].clientY);
        }
        const data = {
          x: x,
          y: y,
          px: px,
          py: py,
          color: userColor,
        };
        socket.emit("drawStroke", data);
        drawLocal(data);
        allDrawings.push(data);
      }
    }

    // Eventi mouse
    canvas.elt.addEventListener("mousedown", startDrawing);
    canvas.elt.addEventListener("mousemove", moveDrawing);
    canvas.elt.addEventListener("mouseup", stopDrawing);
    canvas.elt.addEventListener("mouseout", stopDrawing);

    // Eventi touch
    canvas.elt.addEventListener("touchstart", startDrawing, { passive: false });
    canvas.elt.addEventListener("touchmove", moveDrawing, { passive: false });
    canvas.elt.addEventListener("touchend", stopDrawing);

    // Aggiorna prompt
    const promptInput = document.getElementById("promptInput");
    if (promptInput) {
      promptInput.addEventListener("change", (e) => {
        socket.emit("changePrompt", e.target.value);
        const status = document.getElementById("status");
        if (status) {
          status.textContent = `Prompt aggiornato: ${e.target.value}`;
        }
      });
    }

    // Bottone per generare immagine AI
    document.getElementById("generateButton").addEventListener("click", () => {
      // Ridisegna tutto sul canvas
      redraw();

      // Cattura l'immagine dal canvas
      const prompt = document.getElementById("promptInput").value;
      const imageBase64 = canvas.elt.toDataURL("image/png").split(",")[1];
      console.log("Lunghezza base64:", imageBase64.length); // Debug

      // Solo per debug: mostra l'immagine catturata
      const testImage = new Image();
      testImage.src = `data:image/png;base64,${imageBase64}`;
      testImage.style.width = "100px";
      document.body.appendChild(testImage);

      // Invia l'immagine a Replicate
      socket.emit("generateImage", { image: imageBase64, prompt });
      document.getElementById("status").textContent =
        "Generazione immagine in corso...";

      // Cancella il canvas DOPO aver inviato l'immagine
      clear();
      allDrawings = [];
    });

    console.log("Setup completato!");
  } catch (error) {
    console.error("Errore in setup:", error);
  }
}

function draw() {
  background(bgColor[0], bgColor[1], bgColor[2]);
  if (currentImage) {
    image(currentImage, 0, 0, width, height);
  }
  for (let drawing of allDrawings) {
    fill(
      drawing.color[0],
      drawing.color[1],
      drawing.color[2],
      drawing.color[3] || 255,
    );
    noStroke();
    circle(drawing.x, drawing.y, 50);
  }
}

function drawLocal(data) {
  fill(data.color[0], data.color[1], data.color[2], data.color[3] || 255);
  noStroke();
  circle(data.x, data.y, 50);
}

function drawRemote(data) {
  fill(data.color[0], data.color[1], data.color[2], data.color[3] || 255);
  noStroke();
  circle(data.x, data.y, 50);
}

function sendCanvasImage() {
  console.log("Invio immagine aggiornata al server...");
  redraw();
  const imageBase64 = canvas.elt.toDataURL("image/png").split(",")[1];
  console.log("Lunghezza base64:", imageBase64.length); // Debug
  socket.emit("canvasImage", imageBase64);
}
