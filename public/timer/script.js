const inputTimerName = document.getElementById("input-timer-name");
const displayTimerName = document.getElementById("display-timer-name");
const inputHour = document.getElementById("input-hour");
const inputMin = document.getElementById("input-min");
const inputSec = document.getElementById("input-sec");
const totalTimeReadout = document.getElementById("total-time-readout");

const dropzoneStandby = document.getElementById("dropzone-standby");
const timerDisplayArea = document.getElementById("timer-display-area");

const timerRunningView = document.getElementById("timer-running-view");
const timerFinishedView = document.getElementById("timer-finished-view");
const finishedMessage = document.getElementById("finished-message");

const dispHourTens = document.getElementById("disp-hour-tens");
const dispHourOnes = document.getElementById("disp-hour-ones");
const dispMinTens = document.getElementById("disp-min-tens");
const dispMinOnes = document.getElementById("disp-min-ones");
const dispSecTens = document.getElementById("disp-sec-tens");
const dispSecOnes = document.getElementById("disp-sec-ones");

const btnStart = document.getElementById("btn-start");
const runningControls = document.getElementById("running-controls");
const btnPause = document.getElementById("btn-pause");
const btnUlang = document.getElementById("btn-ulang");
const btnReset = document.getElementById("btn-reset");
const btnSoundEnable = document.getElementById("btn-sound-enable");
const btnSoundDisable = document.getElementById("btn-sound-disable");
const presets = document.querySelectorAll(".preset-pill");
const historyContainer = document.getElementById("history-container");
const historyPills = document.getElementById("history-pills");
const HISTORY_KEY = "timer_history";
const btnDeleteSelected = document.getElementById("btn-delete-selected");

// Fullscreen Elements
const btnExpandDisplay = document.getElementById("btn-expand-display");
const expandedDisplayModal = document.getElementById("expanded-display-modal");
const btnCloseExpanded = document.getElementById("btn-close-expanded");
const expandedTimerName = document.getElementById("expanded-timer-name");
const expBgLayer = document.getElementById("exp-bg-layer");
const colorBtns = document.querySelectorAll(".color-btn");

const expDispHourTens = document.getElementById("exp-disp-hour-tens");
const expDispHourOnes = document.getElementById("exp-disp-hour-ones");
const expDispMinTens = document.getElementById("exp-disp-min-tens");
const expDispMinOnes = document.getElementById("exp-disp-min-ones");
const expDispSecTens = document.getElementById("exp-disp-sec-tens");
const expDispSecOnes = document.getElementById("exp-disp-sec-ones");

const expRunningView = document.getElementById("exp-running-view");
const expFinishedView = document.getElementById("exp-finished-view");
const expFinishedMessage = document.getElementById("exp-finished-message");

// Deklarasi tombol baru pada fullscreen
const btnExpPause = document.getElementById("btn-exp-pause");
const iconExpPause = document.getElementById("icon-exp-pause");
const btnExpUlang = document.getElementById("btn-exp-ulang");
const btnExpReset = document.getElementById("btn-exp-reset");

const pauseIconSVG = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5"></path></svg>`;
const playIconSVG = `<svg class="w-5 h-5 translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z"></path></svg>`;

let timerInterval = null;
let totalSeconds = 0;
let isPaused = false;
let currentTimerName = "Timer Name";
let soundEnabled = true;

inputHour.value = "0";
inputMin.value = "0";
inputSec.value = "0";

// Audio files with error handling
const alarmSound = new Audio("/timer/alarm.mp3");
const warning10MinSound = new Audio("/timer/10Menit.mp3");
const warning5MinSound = new Audio("/timer/5Menit.mp3");
const warning1MinSound = new Audio("/timer/1Menit.mp3");

// Helper function to safely play audio
const playSound = (audio) => {
  if (audio && soundEnabled) {
    audio.play().catch((e) => console.log("Audio playback failed:", e));
  }
};

const formatTime = (time) => time.toString().padStart(2, "0");
const formatTotalReadout = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${formatTime(h)}:${formatTime(m)}:${formatTime(s)}`;
};

const updateDigit = (element, newValue) => {
  if (element.dataset.val !== newValue) {
    element.classList.remove("roll-animation");
    void element.offsetWidth;
    element.textContent = newValue;
    element.dataset.val = newValue;
    element.classList.add("roll-animation");
  }
};

const handleHistoryClick = (event) => {
  const pill = event.currentTarget;
  const name = pill.getAttribute("data-name");
  const hour = pill.getAttribute("data-hours") || "0";
  const min = pill.getAttribute("data-minutes") || "0";
  const sec = pill.getAttribute("data-seconds") || "0";

  // Remove active state from preset pills
  presets.forEach((p) => p.classList.remove("active"));
  // Remove active state from history pills
  document
    .querySelectorAll(".history-pill")
    .forEach((hp) => hp.classList.remove("active"));
  // Mark this one as active
  pill.classList.add("active");

  // Set inputs
  inputTimerName.value = name;
  inputHour.value = hour;
  inputMin.value = min;
  inputSec.value = sec;

  // Update estimate readout
  totalTimeReadout.textContent = formatTotalReadout(
    parseInt(hour) * 3600 + parseInt(min) * 60 + parseInt(sec),
  );
};

const loadHistory = () => {
  if (!historyContainer || !historyPills) return;

  let historyData = [];
  try {
    historyData = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (e) {
    historyData = [];
  }

  if (historyData.length === 0) {
    historyContainer.classList.add("hidden");
    return;
  }

  historyPills.innerHTML = "";
  historyData.forEach((item) => {
    const hourVal = parseInt(item.hours) || 0;
    const minVal = parseInt(item.minutes) || 0;
    const secVal = parseInt(item.seconds) || 0;
    const formattedLabel = `${item.name} (${formatTime(hourVal)}:${formatTime(minVal)}:${formatTime(secVal)})`;

    const pill = document.createElement("div");
    pill.className =
      "preset-pill history-pill bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600/50 flex items-center";
    pill.style.cursor = "pointer";
    pill.setAttribute("data-name", item.name);
    pill.setAttribute("data-hours", hourVal);
    pill.setAttribute("data-minutes", minVal);
    pill.setAttribute("data-seconds", secVal);

    // Checkbox untuk seleksi hapus
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className =
      "history-checkbox rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 mr-2 w-3.5 h-3.5 accent-indigo-600 cursor-pointer";
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation(); // Mencegah load timer ketika mencentang checkbox
      updateDeleteButtonVisibility();
    });

    // Add dot inside pill
    const dot = document.createElement("span");
    dot.className =
      "w-1.5 h-1.5 rounded-full mr-2 bg-gray-400 dark:bg-gray-500";

    // Add label
    const labelSpan = document.createElement("span");
    labelSpan.textContent = formattedLabel;

    pill.appendChild(checkbox);
    pill.appendChild(dot);
    pill.appendChild(labelSpan);

    pill.addEventListener("click", handleHistoryClick);
    historyPills.appendChild(pill);
  });

  historyContainer.classList.remove("hidden");
};

const updateDeleteButtonVisibility = () => {
  if (!btnDeleteSelected) return;
  const checkedBoxes = document.querySelectorAll(".history-checkbox:checked");
  if (checkedBoxes.length > 0) {
    btnDeleteSelected.classList.remove("hidden");
  } else {
    btnDeleteSelected.classList.add("hidden");
  }
};

const deleteSelectedHistory = () => {
  let historyData = [];
  try {
    historyData = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (e) {
    historyData = [];
  }

  const pills = document.querySelectorAll(".history-pill");
  const indicesToDelete = [];

  pills.forEach((pill, index) => {
    const cb = pill.querySelector(".history-checkbox");
    if (cb && cb.checked) {
      indicesToDelete.push(index);
    }
  });

  // Filter item yang tidak dicentang untuk dipertahankan
  historyData = historyData.filter(
    (item, index) => !indicesToDelete.includes(index),
  );

  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyData));
  loadHistory();
  updateDeleteButtonVisibility();
};

const saveToHistory = (name, hours, minutes, seconds) => {
  let historyData = [];
  try {
    historyData = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (e) {
    historyData = [];
  }

  // Filter out duplicate
  historyData = historyData.filter(
    (item) =>
      !(
        item.name === name &&
        parseInt(item.hours || 0) === parseInt(hours) &&
        parseInt(item.minutes) === parseInt(minutes) &&
        parseInt(item.seconds) === parseInt(seconds)
      ),
  );

  // Add to top
  historyData.unshift({ name, hours, minutes, seconds });

  // Limit to 5
  historyData = historyData.slice(0, 5);

  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyData));
  loadHistory();
};

const showFinishedState = () => {
  timerRunningView.classList.add("hidden");
  timerRunningView.classList.remove("flex");
  timerFinishedView.classList.remove("hidden");
  timerFinishedView.classList.add("flex");
  finishedMessage.innerHTML = `Waktu untuk kegiatan <strong class="text-slate-800 text-[0.9rem] uppercase ml-1">"${currentTimerName}"</strong> telah selesai.`;

  expRunningView.classList.add("hidden");
  expRunningView.classList.remove("flex");
  expFinishedView.classList.remove("hidden");
  expFinishedView.classList.add("flex");
  expFinishedMessage.innerHTML = `Waktu untuk kegiatan <strong class="uppercase text-white">"${currentTimerName}"</strong> telah selesai.`;

  btnPause.classList.add("hidden");
};

const resetFinishedState = () => {
  timerFinishedView.classList.add("hidden");
  timerFinishedView.classList.remove("flex");
  timerRunningView.classList.remove("hidden");
  timerRunningView.classList.add("flex");

  expFinishedView.classList.add("hidden");
  expFinishedView.classList.remove("flex");
  expRunningView.classList.remove("hidden");
  expRunningView.classList.add("flex");

  btnPause.classList.remove("hidden");
};

const toggleUI = (isPlaying) => {
  if (isPlaying) {
    resetFinishedState();
    dropzoneStandby.classList.add("hidden");
    timerDisplayArea.classList.remove("hidden");

    inputTimerName.disabled = true;
    inputTimerName.classList.add("opacity-60", "bg-slate-50");
    inputHour.disabled = true;
    inputMin.disabled = true;
    inputSec.disabled = true;
    inputHour.parentElement.classList.add("opacity-60", "bg-slate-50");
    inputMin.parentElement.classList.add("opacity-60", "bg-slate-50");
    inputSec.parentElement.classList.add("opacity-60", "bg-slate-50");
    presets.forEach((p) =>
      p.classList.add("opacity-50", "pointer-events-none"),
    );

    btnStart.classList.add("hidden");
    runningControls.classList.remove("hidden");
    runningControls.classList.add("flex");
  } else {
    resetFinishedState();
    dropzoneStandby.classList.remove("hidden");
    timerDisplayArea.classList.add("hidden");

    inputTimerName.disabled = false;
    inputTimerName.classList.remove("opacity-60", "bg-slate-50");
    inputHour.disabled = false;
    inputMin.disabled = false;
    inputSec.disabled = false;
    inputHour.parentElement.classList.remove("opacity-60", "bg-slate-50");
    inputMin.parentElement.classList.remove("opacity-60", "bg-slate-50");
    inputSec.parentElement.classList.remove("opacity-60", "bg-slate-50");
    presets.forEach((p) =>
      p.classList.remove("opacity-50", "pointer-events-none"),
    );

    btnStart.classList.remove("hidden");
    runningControls.classList.add("hidden");
    runningControls.classList.remove("flex");

    btnPause.innerHTML = pauseIconSVG;
    btnPause.title = "Pause";
    document.title = "Online Timer - Universitas SAQ";
  }
};

const updateDisplay = () => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const currentHourStr = formatTime(h);
  const currentMinStr = formatTime(m);
  const currentSecStr = formatTime(s);

  const titlePrefix = currentTimerName ? `${currentTimerName} - ` : "";
  document.title = `(${currentHourStr}:${currentMinStr}:${currentSecStr}) ${titlePrefix}Timer`;

  // Update Main
  updateDigit(dispHourTens, currentHourStr[0]);
  updateDigit(dispHourOnes, currentHourStr[1]);
  updateDigit(dispMinTens, currentMinStr[0]);
  updateDigit(dispMinOnes, currentMinStr[1]);
  updateDigit(dispSecTens, currentSecStr[0]);
  updateDigit(dispSecOnes, currentSecStr[1]);

  // Update Fullscreen
  updateDigit(expDispHourTens, currentHourStr[0]);
  updateDigit(expDispHourOnes, currentHourStr[1]);
  updateDigit(expDispMinTens, currentMinStr[0]);
  updateDigit(expDispMinOnes, currentMinStr[1]);
  updateDigit(expDispSecTens, currentSecStr[0]);
  updateDigit(expDispSecOnes, currentSecStr[1]);
};

const startTimer = () => {
  if (!isPaused) {
    let h = parseInt(inputHour.value) || 0;
    let m = parseInt(inputMin.value) || 0;
    let s = parseInt(inputSec.value) || 0;
    totalSeconds = h * 3600 + m * 60 + s;

    if (totalSeconds <= 0) return alert("Masukkan waktu yang valid!");

    currentTimerName = inputTimerName.value.trim() || "TUGAS";
    displayTimerName.textContent = currentTimerName;
    expandedTimerName.textContent = currentTimerName;

    // Simpan ke riwayat
    saveToHistory(currentTimerName, h, m, s);
  }

  isPaused = false;
  toggleUI(true);
  updateDisplay();

  // Sinkronisasi tombol utama dan expanded ke state "Pause"
  btnPause.innerHTML = pauseIconSVG;
  btnPause.title = "Pause";
  if (iconExpPause) {
    iconExpPause.innerHTML =
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.75 5.25v13.5m-7.5-13.5v13.5"></path>';
    iconExpPause.classList.remove("translate-x-0.5");
  }

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    totalSeconds--;
    updateDisplay();

    if (totalSeconds === 600) {
      playSound(warning10MinSound);
    } else if (totalSeconds === 300) {
      playSound(warning5MinSound);
    } else if (totalSeconds === 60) {
      playSound(warning1MinSound);
    }

    if (totalSeconds <= 0) {
      clearInterval(timerInterval);
      playSound(alarmSound);

      document.title = "Waktu Habis!";
      showFinishedState();
    }
  }, 1000);
};

const pauseTimer = () => {
  if (isPaused) {
    startTimer(); // Lanjut (Start)
  } else {
    clearInterval(timerInterval);
    isPaused = true;

    // Sinkronisasi tombol utama dan expanded ke state "Lanjut (Play)"
    btnPause.innerHTML = playIconSVG;
    btnPause.title = "Lanjut";
    if (iconExpPause) {
      iconExpPause.innerHTML =
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z"></path>';
      iconExpPause.classList.add("translate-x-0.5");
    }
  }
};

const resetTimer = () => {
  clearInterval(timerInterval);
  isPaused = false;
  totalSeconds = 0;
  toggleUI(false);
  alarmSound.pause();
  alarmSound.currentTime = 0;
};

const ulangTimer = () => {
  alarmSound.pause();
  alarmSound.currentTime = 0;
  isPaused = false;
  startTimer();
};

const handlePresetClick = (event) => {
  const pill = event.currentTarget;
  const hour = pill.getAttribute("data-hours") || "0";
  const min = pill.getAttribute("data-minutes") || "0";
  const sec = pill.getAttribute("data-seconds") || "0";

  presets.forEach((p) => p.classList.remove("active"));
  pill.classList.add("active");
  document
    .querySelectorAll(".history-pill")
    .forEach((hp) => hp.classList.remove("active"));

  inputHour.value = hour;
  inputMin.value = min;
  inputSec.value = sec;
  totalTimeReadout.textContent = formatTotalReadout(
    parseInt(hour) * 3600 + parseInt(min) * 60 + parseInt(sec),
  );
};

[inputHour, inputMin, inputSec].forEach((input) => {
  input.addEventListener("input", () => {
    const h = parseInt(inputHour.value) || 0;
    const m = parseInt(inputMin.value) || 0;
    const s = parseInt(inputSec.value) || 0;
    totalTimeReadout.textContent = formatTotalReadout(h * 3600 + m * 60 + s);
    presets.forEach((p) => p.classList.remove("active"));
    document
      .querySelectorAll(".history-pill")
      .forEach((hp) => hp.classList.remove("active"));
  });
});

btnStart.addEventListener("click", startTimer);
btnPause.addEventListener("click", pauseTimer);
btnUlang.addEventListener("click", ulangTimer);
btnReset.addEventListener("click", resetTimer);
presets.forEach((p) => p.addEventListener("click", handlePresetClick));

// Event listener untuk tombol di dalam modal fullscreen
if (btnExpPause) {
  btnExpPause.addEventListener("click", pauseTimer);
}
if (btnExpUlang) {
  btnExpUlang.addEventListener("click", ulangTimer);
}
if (btnExpReset) {
  btnExpReset.addEventListener("click", () => {
    resetTimer();
    expandedDisplayModal.classList.add("opacity-0", "pointer-events-none");
  });
}
if (btnDeleteSelected) {
  btnDeleteSelected.addEventListener("click", deleteSelectedHistory);
}

// --- LOGIKA TOMBOL SUARA ---
const updateSoundUI = () => {
  if (soundEnabled) {
    btnSoundEnable.classList.remove(
      "opacity-50",
      "bg-transparent",
      "text-slate-500",
      "border-slate-200",
    );
    btnSoundEnable.classList.add(
      "bg-emerald-50",
      "text-emerald-700",
      "border-emerald-300",
    );
    btnSoundDisable.classList.remove(
      "bg-red-50",
      "text-red-600",
      "border-red-200",
    );
    btnSoundDisable.classList.add(
      "opacity-50",
      "bg-transparent",
      "text-slate-500",
      "border-slate-200",
    );
  } else {
    btnSoundEnable.classList.remove(
      "bg-emerald-50",
      "text-emerald-700",
      "border-emerald-300",
    );
    btnSoundEnable.classList.add(
      "opacity-50",
      "bg-transparent",
      "text-slate-500",
      "border-slate-200",
    );
    btnSoundDisable.classList.remove(
      "opacity-50",
      "bg-transparent",
      "text-slate-500",
      "border-slate-200",
    );
    btnSoundDisable.classList.add(
      "bg-red-50",
      "text-red-600",
      "border-red-200",
    );
  }
};
btnSoundEnable.addEventListener("click", () => {
  soundEnabled = true;
  updateSoundUI();
});
btnSoundDisable.addEventListener("click", () => {
  soundEnabled = false;
  updateSoundUI();
});
updateSoundUI();

// --- LOGIKA PILIHAN WARNA ---
colorBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    colorBtns.forEach((b) => {
      b.classList.remove("ring-2");
      b.classList.add("ring-0");
    });

    btn.classList.remove("ring-0");
    btn.classList.add("ring-2");

    const newBg = btn.getAttribute("data-bg");
    expBgLayer.className = `absolute inset-0 bg-gradient-to-br ${newBg} backdrop-blur-sm transition-all duration-500`;
  });
});

// --- LOGIKA EXPANDED (FULLSCREEN) MODAL ---
btnExpandDisplay.addEventListener("click", () => {
  expandedTimerName.textContent = currentTimerName;
  expandedDisplayModal.classList.remove("opacity-0", "pointer-events-none");
});

btnCloseExpanded.addEventListener("click", () => {
  expandedDisplayModal.classList.add("opacity-0", "pointer-events-none");
});

expandedDisplayModal.addEventListener("click", (e) => {
  if (e.target === expandedDisplayModal || e.target === expBgLayer) {
    expandedDisplayModal.classList.add("opacity-0", "pointer-events-none");
  }
});

loadHistory();
