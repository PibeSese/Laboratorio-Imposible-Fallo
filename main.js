import './style.css';

// =============================================
// LABORATORIO IMPOSIBLE
// Homepage controlada mediante gestos de la mano
// MediaPipe cargado desde CDN en index.html
// =============================================

const labNames = {
  becquerel: 'Becquerel — fenómenos radiactivos',
  rutherford: 'Rutherford — dispersión de partículas alfa',
  curie: 'Marie y Pierre Curie — investigación de la pechblenda',
  thomson: 'Thomson — rayos catódicos',
};

const video = document.getElementById('input-video');
const canvas = document.getElementById('camera-canvas');
const ctx = canvas.getContext('2d');

const cursor = document.getElementById('hand-cursor');
const status = document.getElementById('gesture-status');
const placeholder = document.getElementById('camera-placeholder');

const notice = document.querySelector('.notice');
const noticeText = document.querySelector('.notice-text');

const cards = [...document.querySelectorAll('.lab-card')];

const DWELL_TIME = 750;
const CURSOR_SMOOTHING = 0.35;
const FIST_CONFIRM_TIME = 450;
const FIST_LOSS_TOLERANCE = 180;

let selectedLab = null;
let hoveredLab = null;
let hoverStartedAt = 0;

let fistLatched = false;
let fistStartAt = 0;
let fistLastSeenAt = 0;

let lastCursorX = window.innerWidth / 2;
let lastCursorY = window.innerHeight / 2;

let camera = null;
let hands = null;
let cameraStarting = false;
let confirmed = false;

// ---------------------------------------------
// Interfaz
// ---------------------------------------------

function setStatus(message) {
  if (status) {
    status.textContent = message;
  }
}

function clearCardSelection() {
  cards.forEach((card) => {
    card.classList.remove('gesture-selected');
  });

  selectedLab = null;
}

function selectLab(labId) {
  if (selectedLab === labId) return;

  selectedLab = labId;

  cards.forEach((card) => {
    const cardButton = card.querySelector('[data-lab]');

    card.classList.toggle(
      'gesture-selected',
      cardButton?.dataset.lab === labId
    );
  });

  const card = cards.find(
    (item) => item.querySelector('[data-lab]')?.dataset.lab === labId
  );

  const name = card?.querySelector('h2')?.textContent ?? labId;

  setStatus(`SELECCIONADO: ${name}`);
}

function showNotice(message) {
  if (noticeText && notice) {
    noticeText.textContent = message;
    notice.hidden = false;
  }
}

function hideNotice() {
  if (notice) {
    notice.hidden = true;
  }
}

// ---------------------------------------------
// Cursor
// ---------------------------------------------

function updateCursor(x, y) {
  const targetX = (1 - x) * window.innerWidth;
  const targetY = y * window.innerHeight;

  lastCursorX += (targetX - lastCursorX) * CURSOR_SMOOTHING;
  lastCursorY += (targetY - lastCursorY) * CURSOR_SMOOTHING;

  cursor.style.left = `${lastCursorX}px`;
  cursor.style.top = `${lastCursorY}px`;
  cursor.classList.add('visible');
}

function hideCursor() {
  cursor.classList.remove('visible', 'is-selecting', 'is-fist');
}

// ---------------------------------------------
// Reconocimiento de la postura de los dedos
// ---------------------------------------------

function isFingerExtended(landmarks, tipIndex, pipIndex) {
  const tip = landmarks[tipIndex];
  const pip = landmarks[pipIndex];

  return tip.y < pip.y - 0.025;
}

function classifyGesture(landmarks) {
  const indexExtended = isFingerExtended(landmarks, 8, 6);
  const middleExtended = isFingerExtended(landmarks, 12, 10);
  const ringExtended = isFingerExtended(landmarks, 16, 14);
  const pinkyExtended = isFingerExtended(landmarks, 20, 18);

  const extendedCount = [
    indexExtended,
    middleExtended,
    ringExtended,
    pinkyExtended,
  ].filter(Boolean).length;

  const fist = extendedCount === 0;

  const pointing =
    indexExtended &&
    !middleExtended &&
    !ringExtended &&
    !pinkyExtended;

  const openHand = extendedCount >= 3;

  return {
    fist,
    pointing,
    openHand,
  };
}

// ---------------------------------------------
// Selección por permanencia del cursor
// ---------------------------------------------

function getCardAtCursor() {
  const element = document.elementFromPoint(
    lastCursorX,
    lastCursorY
  );

  const button = element?.closest('[data-lab]');
  return button?.dataset.lab ?? null;
}

function updateHoverSelection() {
  const labId = getCardAtCursor();

  if (!labId) {
    hoveredLab = null;
    hoverStartedAt = 0;
    cursor.classList.remove('is-selecting');
    return;
  }

  if (labId !== hoveredLab) {
    hoveredLab = labId;
    hoverStartedAt = performance.now();
  }

  cursor.classList.add('is-selecting');

  const elapsed = performance.now() - hoverStartedAt;

  if (elapsed >= DWELL_TIME) {
    selectLab(labId);
  }
}

function resetHoverSelection() {
  hoveredLab = null;
  hoverStartedAt = 0;
  cursor.classList.remove('is-selecting');
}


 // ---------------------------------------------
 // Confirmación con el puño
 // ---------------------------------------------

 function updateFistGesture(isFist) {
  const now = performance.now();

  if (!isFist) {
    cursor.classList.remove('is-fist');

    // Tolerar pequeñas fluctuaciones de detección.
    if (
      fistLastSeenAt > 0 &&
      now - fistLastSeenAt > FIST_LOSS_TOLERANCE
    ) {
      fistStartAt = 0;
      fistLastSeenAt = 0;
      fistLatched = false;
    }

    return;
  }

  cursor.classList.add('is-fist');
  fistLastSeenAt = now;

  if (!selectedLab || fistLatched || confirmed) {
    return;
  }

  if (fistStartAt === 0) {
    fistStartAt = now;
  }

  const fistDuration = now - fistStartAt;

  if (fistDuration >= FIST_CONFIRM_TIME) {
    fistLatched = true;
    confirmed = true;

    const labFiles = {
      becquerel: './becquerel.html',
      rutherford: './rutherford.html',
      curie: './curie.html',
      thomson: './thomson.html'
    };

    const destination = labFiles[selectedLab];

    if (destination) {
      setStatus('ABRIENDO LABORATORIO');

      window.location.href = destination;
    } else {
      confirmed = false;

      const name = labNames[selectedLab] ?? selectedLab;

      showNotice(`No se encontró la ruta del laboratorio: ${name}.`);

      setStatus('ERROR DE NAVEGACIÓN');
    }
  }
}


// ---------------------------------------------
// Dibujar cámara, conexiones y puntos
// ---------------------------------------------

function drawCameraResults(results) {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (results.image) {
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  }

  const detectedHands = results.multiHandLandmarks ?? [];

  if (detectedHands.length > 0) {
    placeholder.classList.add('is-hidden');

    for (const landmarks of detectedHands) {
      if (typeof drawConnectors === 'function') {
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
          color: '#56f4ff',
          lineWidth: 2,
        });
      }

      if (typeof drawLandmarks === 'function') {
        drawLandmarks(ctx, landmarks, {
          color: '#ffe16c',
          lineWidth: 1,
          radius: 3,
        });
      }
    }

    const landmarks = detectedHands[0];
    const indexTip = landmarks[8];

    updateCursor(indexTip.x, indexTip.y);

    const gesture = classifyGesture(landmarks);

    if (gesture.fist) {
      updateFistGesture(true);

      // No sobrescribir el estado una vez confirmada la selección.
      if (confirmed) {
        setStatus('SELECCIÓN CONFIRMADA');
      } else if (selectedLab) {
        setStatus('PUÑO: CONFIRMANDO…');
      } else {
        setStatus('PUÑO: SELECCIONÁ UNA TARJETA');
      }
    } else {
      updateFistGesture(false);

      if (gesture.pointing) {
        if (confirmed) {
          confirmed = false;
          hideNotice();

          fistLatched = false;
          fistStartAt = 0;
          fistLastSeenAt = 0;
        }

        updateHoverSelection();

        if (!selectedLab) {
          setStatus('MANTENÉ EL ÍNDICE SOBRE UNA TARJETA');
        }
      } else {
        resetHoverSelection();

        if (gesture.openHand) {
          // La mano abierta rearma el gesto.
          // El aviso de confirmación permanece visible.
          fistLatched = false;
          fistStartAt = 0;
          fistLastSeenAt = 0;

          if (confirmed) {
            setStatus('SELECCIÓN CONFIRMADA · MANO ABIERTA');
          } else {
            hideNotice();
            setStatus('MANO ABIERTA: LISTO PARA SELECCIONAR');
          }
        } else if (confirmed) {
          setStatus('SELECCIÓN CONFIRMADA');
        } else {
          setStatus('USÁ EL ÍNDICE PARA SELECCIONAR');
        }
      }
    }
  } else {
    placeholder.classList.remove('is-hidden');
    placeholder.textContent = 'NO SE DETECTA NINGUNA MANO';

    hideCursor();
    resetHoverSelection();

    fistStartAt = 0;
    fistLastSeenAt = 0;
    fistLatched = false;

    if (!confirmed) {
      setStatus('MOSTRÁ LA MANO A LA CÁMARA');
    } else {
      setStatus('SELECCIÓN CONFIRMADA');
    }
  }

  ctx.restore();
}

// ---------------------------------------------
// Inicialización de MediaPipe
// ---------------------------------------------

async function startHandTracking() {
  if (cameraStarting) return;
  cameraStarting = true;

  try {
    if (typeof Hands !== 'function') {
      throw new Error(
        'No se cargó MediaPipe Hands. Revisá la conexión a Internet y los scripts CDN de index.html.'
      );
    }

    if (typeof Camera !== 'function') {
      throw new Error(
        'No se cargó Camera Utils. Revisá el script camera_utils.js.'
      );
    }

    hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.6,
    });

    hands.onResults(drawCameraResults);

    camera = new Camera(video, {
      onFrame: async () => {
        if (video.readyState >= 2) {
          await hands.send({ image: video });
        }
      },
      width: 640,
      height: 480,
    });

    setStatus('SOLICITANDO ACCESO A LA CÁMARA…');

    await camera.start();

    placeholder.classList.remove('is-hidden');
    placeholder.textContent = 'MOSTRÁ LA MANO A LA CÁMARA';

    setStatus('CÁMARA ACTIVA · MOSTRÁ LA MANO');
  } catch (error) {
    console.error('Error al iniciar MediaPipe:', error);

    placeholder.classList.remove('is-hidden');
    placeholder.textContent = 'NO SE PUDO INICIAR LA CÁMARA';

    setStatus(
      'ERROR DE CÁMARA O MEDIAPIPE. REVISÁ LOS PERMISOS Y LA CONSOLA.'
    );
  } finally {
    cameraStarting = false;
  }
}

// ---------------------------------------------
// Inicio
// ---------------------------------------------

// Deshabilitar la navegación por clic.
// La homepage se controla mediante gestos.
document.querySelectorAll('[data-lab]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
});

document.querySelector('.brand')?.addEventListener('click', (event) => {
  event.preventDefault();
});

document.querySelector('.notice-close')?.addEventListener('click', (event) => {
  event.preventDefault();
  hideNotice();
});

document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

window.addEventListener('resize', () => {
  lastCursorX = Math.min(lastCursorX, window.innerWidth);
  lastCursorY = Math.min(lastCursorY, window.innerHeight);
});

startHandTracking();