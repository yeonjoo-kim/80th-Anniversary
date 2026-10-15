(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    archive = window.trajectoryArchive;
  const palette = afsCore.assets;
  const screens = [
    "landing",
    "home",
    "photo",
    "processing",
    "finish",
    "info",
    "record",
    "gallery",
  ];
  const state = {
    screen: "landing",
    photo: null,
    photoUrl: null,
    record: null,
    preview: "arrows",
    infoReturn: "#home",
    busy: false,
    serial: 0,
    saveState: { local: false, cloud: "disabled" },
    recordUrls: [],
    previewUrls: [],
    viewedRecord: null,
    recordNeighbors: { previous: null, next: null },
    deleting: false,
    archiveBackground: null,
    galleryOffset: 0,
    galleryHasMore: true,
    galleryLoading: false,
    galleryLoaded: false,
    galleryScrollTop: 0,
    galleryIds: new Set(),
    galleryUrls: [],
  };
  let stripeOrder = [],
    processTimer,
    audioContext,
    lastFeedback = -Infinity,
    homeTimer,
    previewTimer,
    backTimer,
    gallerySerial = 0,
    recordSerial = 0;

  function status(message) {
    $("status").textContent = message;
  }
  function showError(message) {
    $("error-message").textContent = message;
    $("retry-error-save").hidden = true;
    $("error").hidden = false;
  }
  function clearError() {
    $("error").hidden = true;
  }
  function shuffle(values) {
    const a = [...values];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function composite(color) {
    const raw = color.hex
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16));
    return raw.map((v, i) =>
      Math.round(v * color.opacity + [238, 238, 239][i] * (1 - color.opacity)),
    );
  }
  function ink(color) {
    const channels = composite(color).map((x) => {
      const c = x / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] >
      0.179
      ? "#231815"
      : "#ffffff";
  }
  function cssColor(color) {
    return "rgb(" + composite(color).join(" ") + ")";
  }
  function colorButton(button, color) {
    button.dataset.lastColor = color.hex;
    const rgb = color.hex
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16));
    button.style.setProperty(
      "--button-color",
      `rgb(${rgb.join(" ")} / ${color.opacity})`,
    );
    button.style.setProperty("--button-ink", ink(color));
  }
  function randomizeButtons() {
    const colors = shuffle(palette);
    document
      .querySelectorAll(".color-button")
      .forEach((button, i) => colorButton(button, colors[i % colors.length]));
    document
      .querySelectorAll(".back-button, .arrow-button")
      .forEach(paintInteraction);
  }
  function updatePageSurface() {
    const home = state.screen === "home";
    document.documentElement.dataset.screen = state.screen;
    document.documentElement.style.setProperty(
      "--page-surface",
      home
        ? "var(--home-surface, #EEEEEF)"
        : ["gallery", "record"].includes(state.screen)
          ? state.archiveBackground || "#EEEEEF"
          : "#EEEEEF",
    );
    document.querySelector('meta[name="theme-color"]').content =
      home && stripeOrder.length
        ? cssColor(stripeOrder[0])
        : ["gallery", "record"].includes(state.screen)
          ? state.archiveBackground || "#EEEEEF"
          : "#EEEEEF";
  }
  function drawStripes() {
    document.documentElement.style.setProperty(
      "--home-surface",
      `linear-gradient(to right, ${stripeOrder.map((color, i) => `${cssColor(color)} ${i * 12.5}% ${(i + 1) * 12.5}%`).join(", ")})`,
    );
    updatePageSurface();
    $("stripe-field").replaceChildren(
      ...stripeOrder.map((color) => {
        const stripe = document.createElement("div");
        stripe.className = "stripe";
        stripe.style.backgroundColor = cssColor(color);
        return stripe;
      }),
    );
    document.querySelectorAll(".vertical-action").forEach((button) => {
      const color = stripeOrder[Number(button.dataset.stripe)];
      button.dataset.lastColor = color.hex;
      button.style.color = ink(color);
    });
  }
  function randomizeHome() {
    stripeOrder = shuffle(palette);
    drawStripes();
    randomizeButtons();
  }
  let audioBuffer,
    audioDecoding,
    nextSound = 0;
  const soundCues = [
    [0, 0.075],
    [0.3, 0.075],
    [0.6, 0.075],
    [0.9, 0.085],
    [1.2, 0.085],
    [1.5, 0.085],
    [1.8, 0.085],
    [2.1, 0.085],
  ];
  const isIOS =
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let mediaBackend = !(window.AudioContext || window.webkitAudioContext);
  let mediaAudio,
    mediaActivated = false,
    sessionAudio,
    sessionPending;
  const audioBytes = fetch("assets/audio/feedback-sprite.wav")
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
  function playbackSession() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = "playback";
    } catch {}
  }
  function activateSession() {
    playbackSession();
    if (!isIOS) return;
    if (!sessionAudio) {
      // A continuous, silent media session gives iOS Web Audio the media output route.
      // Audible clicks are rendered by AudioBufferSourceNode, never stopped by a JS timer.
      sessionAudio = new Audio("assets/audio/session-silence.m4a");
      sessionAudio.loop = true;
      sessionAudio.preload = "auto";
      sessionAudio.hidden = true;
      sessionAudio.muted = false;
      sessionAudio.volume = 1;
      sessionAudio.dataset.feedback = "session";
      sessionAudio.setAttribute("playsinline", "");
      sessionAudio.setAttribute("webkit-playsinline", "");
      sessionAudio.setAttribute("disableRemotePlayback", "");
      sessionAudio.setAttribute("x-webkit-airplay", "deny");
      document.body.append(sessionAudio);
    }
    if (sessionAudio.paused && !sessionPending) {
      sessionPending = sessionAudio.play();
      sessionPending?.then(
        () => {
          sessionPending = null;
        },
        () => {
          sessionPending = null;
        },
      );
    }
  }
  function ensureMediaAudio() {
    if (!mediaAudio) {
      mediaAudio = new Audio();
      mediaAudio.preload = "auto";
      mediaAudio.hidden = true;
      mediaAudio.dataset.feedback = "fallback";
      mediaAudio.setAttribute("playsinline", "");
      document.body.append(mediaAudio);
    }
    return mediaAudio;
  }
  function primeAudio() {
    activateSession();
    if (mediaBackend) {
      ensureMediaAudio();
      return Promise.resolve();
    }
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      let freshContext = false;
      if (!audioContext || audioContext.state === "closed") {
        audioContext = new AudioCtor({ latencyHint: "interactive" });
        freshContext = true;
        if (!audioBuffer) audioDecoding = null;
      }
      let resumed = Promise.resolve();
      if (freshContext || audioContext.state !== "running") {
        // Start a sample and call resume synchronously in the trusted touch/click.
        const unlock = audioContext.createBufferSource();
        unlock.buffer = audioContext.createBuffer(
          1,
          1,
          audioContext.sampleRate,
        );
        unlock.connect(audioContext.destination);
        unlock.start(0);
        resumed = audioContext.resume().catch(() => {
          mediaBackend = true;
        });
      }
      audioDecoding ||= audioBytes
        .then((bytes) =>
          bytes ? audioContext.decodeAudioData(bytes.slice(0)) : null,
        )
        .then((buffer) => (audioBuffer = buffer))
        .catch(() => null);
      return resumed;
    } catch {
      mediaBackend = true;
      ensureMediaAudio();
      return Promise.resolve();
    }
  }
  function playMedia(index) {
    const element = ensureMediaAudio();
    const source = new URL(
      `assets/audio/tap-${index + 1}.m4a`,
      document.baseURI,
    ).href;
    if (element.src !== source) element.src = source;
    else {
      element.pause();
      try {
        element.currentTime = 0;
      } catch {}
    }
    element.muted = false;
    element.volume = 1;
    // The encoded clip has a silent tail and ends naturally. Do not truncate the output queue.
    element.play()?.then(
      () => {
        mediaActivated = true;
      },
      () => {
        mediaActivated = false;
      },
    );
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    sessionAudio?.pause();
    mediaAudio?.pause();
  });
  function feedback({ vibrate = true, unlock = true } = {}) {
    const resumed = unlock ? primeAudio() : Promise.resolve();
    if (
      !unlock &&
      (mediaBackend ? !mediaActivated : audioContext?.state !== "running")
    )
      return;
    if (performance.now() - lastFeedback < 70) return;
    lastFeedback = performance.now();
    try {
      if (vibrate) navigator.vibrate?.(18);
    } catch {}
    const index = nextSound++ % soundCues.length;
    if (mediaBackend) {
      playMedia(index);
      return;
    }
    const play = (buffer) => {
      if (!buffer || mediaBackend) {
        mediaBackend = true;
        playMedia(index);
        return;
      }
      if (audioContext.state !== "running" || document.hidden) return;
      const [offset, duration] = soundCues[index],
        now = audioContext.currentTime;
      const source = audioContext.createBufferSource(),
        gain = audioContext.createGain();
      source.buffer = buffer;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.8, now + 0.002);
      gain.gain.setValueAtTime(0.8, now + duration - 0.01);
      gain.gain.linearRampToValueAtTime(0, now + duration);
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.start(now, offset, duration);
    };
    if (audioBuffer && audioContext.state === "running") play(audioBuffer);
    else
      void Promise.all([resumed, audioDecoding]).then(([, buffer]) =>
        play(buffer),
      );
  }
  function differentColor(previous, excluded) {
    const choices = palette.filter(
      (color) => color.hex !== previous && color.hex !== excluded,
    );
    return choices[Math.floor(Math.random() * choices.length)];
  }
  function paintInteraction(button) {
    if (button.matches(".info-button, a")) return;
    // Keep Delete legible against the archive surface, including during a tap.
    if (button.classList.contains("delete-button")) return;
    const color = differentColor(
      button.dataset.lastColor,
      button.matches(".back-button, .arrow-button") &&
        ["gallery", "record"].includes(state.screen)
        ? state.archiveBackground
        : null,
    );
    button.dataset.lastColor = color.hex;
    if (button.id === "enter") {
      randomizeLanding();
      return;
    }
    if (button.matches(".back-button, .arrow-button")) {
      button.style.color = `rgb(${color.hex
        .slice(1)
        .match(/../g)
        .map((v) => parseInt(v, 16))
        .join(" ")} / ${color.opacity})`;
      return;
    }
    if (button.classList.contains("vertical-action")) {
      stripeOrder[Number(button.dataset.stripe)] = color;
      drawStripes();
      return;
    }
    colorButton(button, color);
    if (!button.classList.contains("archive-card")) {
      button.style.backgroundColor = "var(--button-color)";
      button.style.color = "var(--button-ink)";
    }
  }
  const interactionTarget = (event) => event.target.closest("button");
  let heldButton = null;
  document.addEventListener("pointerover", (event) => {
    const button = interactionTarget(event);
    if (
      event.pointerType === "mouse" &&
      button &&
      !button.disabled &&
      !button.contains(event.relatedTarget)
    ) {
      paintInteraction(button);
    }
  });
  document.addEventListener(
    "pointerdown",
    (event) => {
      const button = interactionTarget(event);
      if (!button || button.disabled || event.button !== 0) return;
      heldButton = {
        button,
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        last: performance.now(),
        moved: false,
      };
      delete button.dataset.dragged;
      paintInteraction(button);
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (event) => {
      if (!heldButton || event.pointerId !== heldButton.id) return;
      if (
        Math.hypot(event.clientX - heldButton.x, event.clientY - heldButton.y) >
        8
      )
        heldButton.moved = true;
      if (heldButton.moved && performance.now() - heldButton.last > 85) {
        heldButton.last = performance.now();
        paintInteraction(heldButton.button);
      }
    },
    true,
  );
  for (const type of ["pointerup", "pointercancel"])
    document.addEventListener(
      type,
      () => {
        if (heldButton?.moved) heldButton.button.dataset.dragged = "true";
        heldButton = null;
      },
      true,
    );
  document.addEventListener(
    "click",
    (event) => {
      const button = interactionTarget(event);
      if (button?.dataset.dragged === "true") {
        delete button.dataset.dragged;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (button && !button.disabled) {
        paintInteraction(button);
        // One cue per activation, in the trusted click/tap handler (also Enter/Space).
        feedback();
      }
    },
    true,
  );

  let pointer = null;
  $("stripe-field").addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, steps: 0 };
    $("stripe-field").setPointerCapture(event.pointerId);
  });
  $("stripe-field").addEventListener("pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const step = Math.trunc((event.clientX - pointer.x) / 28);
    if (step === pointer.steps) return;
    const direction = step > pointer.steps ? 1 : -1;
    if (direction > 0) stripeOrder.unshift(stripeOrder.pop());
    else stripeOrder.push(stripeOrder.shift());
    pointer.steps = step;
    drawStripes();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    $("stripe-field").addEventListener(event, () => {
      pointer = null;
    });

  function fitRecordLayout() {
    if (state.screen !== "record") return;
    const media = $("record-media");
    const gap = parseFloat(getComputedStyle($("record-images")).columnGap) || 8;
    const control =
      parseFloat(getComputedStyle($("delete-record")).width) || 44;
    const desktop = matchMedia("(min-width: 1024px)").matches;
    const reserve = desktop ? 0 : control + gap;
    const side = desktop ? control + gap : 0;
    const panel = Math.max(
      0,
      Math.min(
        (media.clientWidth - gap - side * 2) / 2,
        (media.clientHeight - reserve) * 0.8,
      ),
    );
    const height = panel * 1.25,
      width = panel * 2 + gap;
    const left = (media.clientWidth - width) / 2;
    const top = Math.max(0, (media.clientHeight - height - reserve) / 2);
    for (const [name, value] of Object.entries({
      "pair-left": left,
      "pair-top": top,
      "pair-width": width,
      "panel-height": height,
      "delete-left": desktop ? left + width + gap : left + width - control,
      "delete-top": desktop ? top : top + height + gap,
    }))
      media.style.setProperty("--" + name, value + "px");
  }
  function fitRecordPhoto() {
    fitRecordLayout();
    const image = $("record-photo");
    if (
      state.screen !== "record" ||
      !image.naturalWidth ||
      image.closest("#record-images").hidden
    )
      return;
    const portrait = image.naturalHeight > image.naturalWidth;
    image.classList.toggle("is-portrait", portrait);
    if (portrait) {
      const frame = image.parentElement;
      const width = Math.min(frame.clientWidth, frame.clientHeight * 0.8);
      image.style.width = width + "px";
      image.style.height = width * 1.25 + "px";
    } else {
      image.style.width = "100%";
      image.style.height = "100%";
    }
  }
  $("record-photo").addEventListener("load", fitRecordPhoto);
  if (window.ResizeObserver)
    new ResizeObserver(fitRecordPhoto).observe($("record-media"));
  addEventListener("resize", fitRecordPhoto);
  function updateTimers() {
    clearInterval(homeTimer);
    clearInterval(previewTimer);
    clearInterval(backTimer);
    if (document.hidden) return;
    if (
      ["info", "photo", "gallery", "record"].includes(state.screen) &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      backTimer = setInterval(rotateBackButtons, 1000);
    if (state.screen === "home")
      homeTimer = setInterval(() => {
        stripeOrder = shuffle(palette);
        drawStripes();
      }, 2000);
    if (
      state.screen === "finish" &&
      state.record &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      previewTimer = setInterval(
        () => setPreview(state.preview === "arrows" ? "poster" : "arrows"),
        800,
      );
    }
  }
  function fitInfo() {
    if (state.screen !== "info") return;
    const copy = document.querySelector(".info-copy");
    copy.style.fontSize = "";
    // Desktop text keeps its readable minimum; the copy can scroll internally.
    if (
      matchMedia("(min-width: 1024px), (hover: hover) and (pointer: fine)")
        .matches
    )
      return;
    let size = parseFloat(getComputedStyle(copy).fontSize);
    for (let i = 0; i < 6 && copy.scrollHeight > copy.clientHeight + 1; i++) {
      size *= Math.min(0.97, copy.clientHeight / copy.scrollHeight);
      copy.style.fontSize = size + "px";
    }
  }
  function displayScreen(name) {
    if (state.screen === "gallery")
      state.galleryScrollTop = $("gallery-scroll").scrollTop;
    for (const id of screens) $(id).hidden = id !== name;
    state.screen = name;
    $(name).setAttribute("tabindex", "-1");
    $(name).focus({ preventScroll: true });
    if (name === "landing") randomizeLanding();
    if (["gallery", "record"].includes(name)) {
      const color = differentColor(state.archiveBackground);
      state.archiveBackground = color.hex;
      document.documentElement.style.setProperty(
        "--archive-background",
        color.hex,
      );
      document.documentElement.style.setProperty(
        "--archive-ink",
        ink({ ...color, opacity: 1 }),
      );
      document.documentElement.style.setProperty(
        "--delete-ink",
        ink({ ...color, opacity: 1 }) === "#ffffff" ? "#ffffff" : "#000000",
      );
    }
    updatePageSurface();
    if (name === "info") requestAnimationFrame(fitInfo);
    if (name === "record") requestAnimationFrame(fitRecordPhoto);
    if (name === "record")
      document
        .querySelectorAll("#record .arrow-button")
        .forEach(paintInteraction);
    rotateBackButtons();
    updateTimers();
  }
  addEventListener("resize", fitInfo);
  document.fonts.ready.then(fitInfo);
  document.fonts.addEventListener("loadingdone", fitInfo);
  document.addEventListener("visibilitychange", updateTimers);
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    updateTimers,
  );
  function navigate(hash) {
    clearError();
    if (location.hash === hash) route();
    else location.hash = hash;
  }
  function archiveMessage(record = state.record) {
    if (record?.cloud)
      return "이미지 3장 온라인 저장 완료 · 링크로 다시 볼 수 있어요.";
    if (state.saveState.cloud === "pending")
      return "이미지 3장을 온라인에 저장하고 있어요…";
    if (state.saveState.cloud === "failed")
      return state.saveState.local
        ? "이 브라우저에 저장됨 · 온라인 저장을 다시 시도할 수 있어요."
        : "온라인 저장 실패 · 이미지 다운로드로 보관해 주세요.";
    return state.saveState.local
      ? "이 브라우저에 저장됨 · 온라인 저장 미연결"
      : "이미지 다운로드로 보관할 수 있어요.";
  }
  function updateArchiveUI() {
    $("archive-status").textContent = archiveMessage();
    updateDeleteButton();
    if (
      state.screen === "record" &&
      state.viewedRecord?.id === state.record?.id
    ) {
      $("retry-cloud").hidden =
        !archive.configured() ||
        Boolean(state.viewedRecord.cloud) ||
        state.saveState.cloud === "pending";
    }
  }
  async function route() {
    if (!state.deleting && $("delete-dialog").open) $("delete-dialog").close();
    recordSerial++;
    gallerySerial++;
    state.galleryLoading = false;
    if (state.busy && state.screen === "processing") {
      state.serial++;
      state.busy = false;
      clearInterval(processTimer);
    }
    const hash = location.hash;
    if (hash === "#archive") {
      const returning = state.screen === "record" && state.galleryLoaded;
      displayScreen("gallery");
      if (returning) {
        $("gallery-scroll").scrollTop = state.galleryScrollTop;
        ensureGalleryFilled();
      } else await loadGallery(true);
      return;
    }
    if (hash.startsWith("#result/")) {
      displayScreen("record");
      await loadRecord(hash.slice(8));
      return;
    }
    if (hash === "#info") {
      displayScreen("info");
      return;
    }
    if (hash === "#photo" && state.photo) {
      displayScreen("photo");
      return;
    }
    if (hash === "#finish" && state.record) {
      displayScreen("finish");
      return;
    }
    if (
      hash === "#home" ||
      hash === "#make" ||
      hash === "#photo" ||
      hash === "#finish"
    ) {
      displayScreen("home");
      return;
    }
    displayScreen("landing");
  }
  $("enter").addEventListener("click", () => navigate("#home"));
  document
    .querySelectorAll("[data-action=home]")
    .forEach((button) =>
      button.addEventListener("click", () => navigate("#home")),
    );
  document
    .querySelectorAll('[data-action="archive"]')
    .forEach((button) =>
      button.addEventListener("click", () => navigate("#archive")),
    );
  let backArrows = [];
  const backQueues = new WeakMap();
  function rotateBackButtons() {
    if (!backArrows.length) return;
    document
      .querySelectorAll(".screen:not([hidden]) .back-button")
      .forEach((button) => {
        let queue = backQueues.get(button);
        if (!queue?.length) {
          queue = shuffle(backArrows.map((_, i) => i));
          if (queue.at(-1) === Number(button.dataset.arrow)) queue.reverse();
          backQueues.set(button, queue);
        }
        const index = queue.pop(),
          arrow = backArrows[index];
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        const path = document.createElementNS(svg.namespaceURI, "path");
        svg.setAttribute("viewBox", arrow.viewBox);
        svg.setAttribute("aria-hidden", "true");
        path.setAttribute("d", arrow.path);
        path.setAttribute("transform", arrow.transform);
        path.setAttribute("fill", "currentColor");
        svg.append(path);
        button.replaceChildren(svg);
        button.dataset.arrow = String(index);
        paintInteraction(button);
      });
  }
  const backReady = fetch("assets/back-arrows.json")
    .then((r) => {
      if (!r.ok) throw Error("Back arrows unavailable");
      return r.json();
    })
    .then((arrows) => {
      backArrows = arrows;
      rotateBackButtons();
    })
    .catch(() => {});
  let landingSVGReady = false;
  function randomizeLanding() {
    if (!landingSVGReady) return;
    const colors = shuffle(palette);
    document
      .querySelectorAll("#landing-art .landing-arrow")
      .forEach((path, i) => {
        path.setAttribute("fill", colors[i].hex);
        path.setAttribute("fill-opacity", colors[i].opacity);
      });
  }
  function fitLanding() {
    const svg = $("landing-art").querySelector("svg");
    if (!svg) return;
    const { width, height } = $("experience").getBoundingClientRect();
    const aspect = width / height;
    // One camera for every screen: preserve the reference's center and height.
    // A wider window reveals more of the same paths to either side.
    const frameWidth = 402;
    const frameHeight = 874;
    const centerX = 201;
    const centerY = 437;
    const h = Math.max(frameHeight, frameWidth / aspect);
    const w = h * aspect;
    svg.setAttribute(
      "viewBox",
      `${centerX - w / 2} ${centerY - h / 2} ${w} ${h}`,
    );
  }
  addEventListener("resize", fitLanding);
  const landingReady = fetch("assets/landing.svg?v=7")
    .then((r) => {
      if (!r.ok) throw Error();
      return r.text();
    })
    .then((text) => {
      $("landing-art").innerHTML = text;
      landingSVGReady = true;
      fitLanding();
      randomizeLanding();
    })
    .catch(() => {});
  let infoSVG = "";
  const infoReady = fetch("assets/info-arrow.svg")
    .then((r) => {
      if (!r.ok) throw Error("Info artwork unavailable");
      return r.text();
    })
    .then((text) => {
      infoSVG = text;
      setInfoColor();
    })
    .catch(() => {});
  function setInfoColor() {
    const color = palette[Math.floor(Math.random() * palette.length)];
    if (infoSVG) {
      const doc = new DOMParser().parseFromString(infoSVG, "image/svg+xml");
      doc.documentElement.setAttribute("preserveAspectRatio", "xMinYMid slice");
      const path = doc.querySelector("path");
      path.setAttribute("fill", color.hex);
      path.setAttribute("fill-opacity", String(color.opacity));
      $("info-art").innerHTML = new XMLSerializer().serializeToString(
        doc.documentElement,
      );
    }
  }
  document.querySelectorAll("[data-action=info]").forEach((button) =>
    button.addEventListener("click", () => {
      state.infoReturn = location.hash || "#home";
      setInfoColor();
      navigate("#info");
    }),
  );
  $("close-info").addEventListener("click", () => navigate(state.infoReturn));
  $("take-photo").addEventListener("click", () => $("camera-file").click());
  // Open the native photo chooser synchronously in the user's click gesture.
  // Safari controls its own Photos/Camera/Files source menu; sites cannot select an item for it.
  $("choose-photo").addEventListener("click", () => {
    const input = $("library-file");
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {}
    input.click();
  });

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image decoding failed"));
      image.src = source;
    });
  }
  function toBlob(canvas, type = "image/png", quality) {
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Image export failed")),
        type,
        quality,
      ),
    );
  }
  function dataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  function canvas(width, height) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }
  let photoLoadSerial = 0;
  async function selectPhoto(file) {
    if (!file || state.busy) return;
    clearError();
    if (file.size > 30 * 1024 * 1024) {
      showError("30MB 이하의 사진을 선택해 주세요.");
      return;
    }
    if (
      file.type === "image/svg+xml" ||
      (file.type && !file.type.startsWith("image/"))
    ) {
      showError("JPG, PNG, WebP 같은 사진 파일을 선택해 주세요.");
      return;
    }
    const serial = ++photoLoadSerial,
      url = URL.createObjectURL(file);
    $("create").disabled = true;
    status("사진을 불러오고 있습니다.");
    try {
      const image = await loadImage(url),
        scale = Math.min(
          1,
          2400 / Math.max(image.naturalWidth, image.naturalHeight),
        );
      const c = canvas(
          Math.max(1, Math.round(image.naturalWidth * scale)),
          Math.max(1, Math.round(image.naturalHeight * scale)),
        ),
        ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(image, 0, 0, c.width, c.height);
      const photo = await toBlob(c, "image/jpeg", 0.92);
      if (serial !== photoLoadSerial) return;
      if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
      state.photo = photo;
      state.photoUrl = URL.createObjectURL(photo);
      $("photo-preview").parentElement.style.setProperty(
        "--photo-ratio",
        String(c.width / c.height),
      );
      $("photo-preview").src = state.photoUrl;
      randomizeButtons();
      navigate("#photo");
      status("사진을 불러왔습니다. 그리기를 눌러 궤적을 만드세요.");
    } catch {
      showError(
        "사진을 열지 못했어요. JPG, PNG 또는 WebP로 다시 선택해 주세요.",
      );
      status("사진을 열지 못했습니다.");
    } finally {
      URL.revokeObjectURL(url);
      if (serial === photoLoadSerial) $("create").disabled = false;
    }
  }
  for (const id of ["camera-file", "library-file"])
    $(id).addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      selectPhoto(file);
      event.target.value = "";
    });

  for (let i = 1; i <= 8; i++) {
    const img = new Image();
    img.src = `assets/process-${i}.svg?v=5`;
    img.alt = "";
    $("process-frames").append(img);
  }
  function startProcessing() {
    const frames = [...$("process-frames").children];
    let index = 0;
    frames.forEach((frame, i) => frame.classList.toggle("active", i === 0));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    processTimer = setInterval(() => {
      frames[index].classList.remove("active");
      index = (index + 1) % 8;
      frames[index].classList.add("active");
    }, 230);
  }
  function dateStamp(iso) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(iso));
    const part = (type) => parts.find((p) => p.type === type).value;
    return `${part("year")}/${part("month")}/${part("day")}`;
  }
  function arrowMarkup(result) {
    const markup = result.active
      .map((arrow) => {
        const source = backArrows.find(
          (shape) => shape.direction === arrow.dir,
        );
        if (!source) throw new Error("Arrow artwork unavailable");
        const [x, y] = source.origin;
        return `<g data-arrow-source="${source.number}" fill="${arrow.hex}" opacity="${arrow.opacity}" transform="translate(62 382) scale(.6) translate(${-x} ${-y})"><path d="${source.path}" transform="${source.transform}"/></g>`;
      })
      .join("");
    // Center the visible combination, rather than its shared starting point.
    // Keep the original scale and vertical placement in both exported images.
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden";
    svg.innerHTML = `<g>${markup}</g>`;
    document.body.append(svg);
    try {
      const bounds = svg.firstElementChild.getBBox();
      const shift = EXPORT_FRAME.width / 2 - (bounds.x + bounds.width / 2);
      return `<g data-layer="trajectory" transform="translate(${shift} 0)">${markup}</g>`;
    } finally {
      svg.remove();
    }
  }
  let posterTypePromise;
  function posterType() {
    return (posterTypePromise ||= fetch("assets/poster-type.svg")
      .then((r) => {
        if (!r.ok) throw Error("Poster artwork unavailable");
        return r.text();
      })
      .then((text) => {
        const doc = new DOMParser().parseFromString(text, "image/svg+xml");
        const svg = doc.documentElement;
        const markup = svg.innerHTML;
        svg.setAttribute(
          "style",
          "position:fixed;left:-10000px;top:0;width:1px;height:1px;visibility:hidden",
        );
        const mounted = document.importNode(svg, true);
        document.body.append(mounted);
        try {
          const bounds = mounted.getBBox();
          return {
            markup,
            centerX: bounds.x + bounds.width / 2,
            centerY: bounds.y + bounds.height / 2,
          };
        } finally {
          mounted.remove();
        }
      })
      .catch((error) => {
        posterTypePromise = null;
        throw error;
      }));
  }
  const EXPORT_WIDTH = 1200,
    EXPORT_HEIGHT = 1500;
  const EXPORT_FRAME = { x: 0, y: 140, width: 402, height: 502.5 };
  async function artifact(result, createdAt, photo, withType) {
    await backReady;
    const type = withType ? await posterType() : null;
    // Original outlined institution logo: left/start at (57.25777, 615.96997).
    // Apply exactly the typography centering translation, then leave an 8-unit gutter.
    const photoX = type ? 57.25777 + EXPORT_FRAME.width / 2 - type.centerX : 0;
    const photoY = type
      ? 615.96997 +
        EXPORT_FRAME.y +
        EXPORT_FRAME.height / 2 -
        type.centerY -
        8 -
        50
      : 0;
    const thumbnail = withType
      ? `<image data-layer="poster-photo" x="${photoX}" y="${photoY}" width="37" height="50" preserveAspectRatio="xMidYMid slice" href="${await dataURL(photo)}"/>`
      : "";
    const typeLayer = type
      ? `<g data-layer="poster-typography" transform="translate(${EXPORT_FRAME.width / 2 - type.centerX} ${EXPORT_FRAME.y + EXPORT_FRAME.height / 2 - type.centerY})">${type.markup}</g>${thumbnail}`
      : "";
    await document.fonts.load('18px "Panchi Mono"');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_WIDTH}" height="${EXPORT_HEIGHT}" viewBox="0 140 402 502.5"><rect x="0" y="140" width="402" height="502.5" fill="#EEEEEF"/>${arrowMarkup(result)}${typeLayer}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const image = await loadImage(url),
        c = canvas(EXPORT_WIDTH, EXPORT_HEIGHT);
      const ctx = c.getContext("2d");
      ctx.drawImage(image, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
      ctx.save();
      ctx.scale(
        EXPORT_WIDTH / EXPORT_FRAME.width,
        EXPORT_HEIGHT / EXPORT_FRAME.height,
      );
      ctx.translate(283, 558 - EXPORT_FRAME.y);
      ctx.rotate(-Math.PI / 6);
      ctx.font = '18px "Panchi Mono"';
      ctx.fillStyle = "#4400FF";
      ctx.fillText(dateStamp(createdAt), 0, 0);
      ctx.restore();
      return await toBlob(c);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function setPreview(kind) {
    state.preview = kind;
    $("result-preview").src = state.previewUrls[kind === "poster" ? 1 : 0];
    $("result-preview").alt =
      kind === "poster"
        ? "궤적, 날짜, 사진과 글자를 합친 완성 포스터"
        : "사진에서 생성한 궤적과 생성 날짜";
  }
  async function persist(record) {
    state.saveState = {
      local: false,
      cloud: archive.configured() ? "pending" : "disabled",
    };
    updateArchiveUI();
    try {
      await archive.localSave(record);
      if (state.record?.id === record.id) {
        state.saveState.local = true;
        updateArchiveUI();
      }
    } catch {
      if (state.record?.id === record.id)
        showError(
          "이 브라우저에 저장하지 못했어요. 다운로드로 이미지를 보관해 주세요.",
        );
    }
    if (!archive.configured()) {
      if (state.screen === "gallery" && $("gallery-scroll").scrollTop < 40)
        void loadGallery(true);
      return;
    }
    try {
      await archive.onlineSave(record);
      try {
        await archive.localSave(record);
      } catch {}
      if (state.record?.id === record.id) {
        state.saveState.cloud = "saved";
        updateArchiveUI();
      }
      if (state.screen === "gallery" && $("gallery-scroll").scrollTop < 40)
        void loadGallery(true);
    } catch (error) {
      if (state.record?.id === record.id) {
        state.saveState.cloud = "failed";
        updateArchiveUI();
        showError(
          "온라인 저장을 완료하지 못했어요. 다시 시도하거나 다운로드로 보관해 주세요.",
        );
        $("retry-error-save").hidden = false;
      }
    }
  }
  $("create").addEventListener("click", async () => {
    if (!state.photo || state.busy) return;
    clearError();
    state.busy = true;
    const serial = ++state.serial,
      started = performance.now();
    displayScreen("processing");
    startProcessing();
    status("사진의 색과 선에서 궤적을 그리고 있습니다.");
    try {
      const image = await loadImage(state.photoUrl),
        scale = 320 / Math.max(image.naturalWidth, image.naturalHeight),
        c = canvas(
          Math.max(1, Math.round(image.naturalWidth * scale)),
          Math.max(1, Math.round(image.naturalHeight * scale)),
        );
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, c.width, c.height);
      const result = afsCore.analyze(
          ctx.getImageData(0, 0, c.width, c.height).data,
          c.width,
          c.height,
          "low",
        ),
        createdAt = new Date().toISOString();
      const [arrows, poster] = await Promise.all([
        artifact(result, createdAt, state.photo, false),
        artifact(result, createdAt, state.photo, true),
      ]);
      const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 1840;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(0, duration - (performance.now() - started)),
        ),
      );
      if (serial !== state.serial) return;
      const record = {
        id: crypto.randomUUID(),
        createdAt,
        photo: state.photo,
        arrows,
        poster,
        colorCount: result.active.length,
        cloud: null,
      };
      state.record = record;
      state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
      state.previewUrls = [
        URL.createObjectURL(arrows),
        URL.createObjectURL(poster),
      ];
      setPreview("arrows");
      randomizeButtons();
      state.busy = false;
      clearInterval(processTimer);
      navigate("#finish");
      status(`${result.active.length}가지 색으로 나의 궤적을 완성했습니다.`);
      void persist(record);
    } catch {
      if (serial === state.serial) {
        state.busy = false;
        navigate("#photo");
        showError("궤적을 만들지 못했어요. 다시 시도해 주세요.");
      }
    } finally {
      if (serial === state.serial) {
        clearInterval(processTimer);
        state.busy = false;
      }
    }
  });

  $("restart").addEventListener("click", () => {
    randomizeHome();
    navigate("#home");
  });

  let downloadInProgress = false;
  async function saveImage(record, kind) {
    return saveImages(record, [kind]);
  }
  async function saveImages(record, kinds) {
    if (downloadInProgress || !record) return;
    downloadInProgress = true;
    clearError();
    const controls = [$("save-arrows"), $("save-poster"), $("save-both")];
    controls.forEach((button) => (button.disabled = true));
    try {
      // Fin already has both blobs: call native share before the first await to retain user activation.
      const blobs = kinds.every((kind) => record[kind])
        ? kinds.map((kind) => record[kind])
        : await Promise.all(
            kinds.map(async (kind) => {
              if (record[kind]) return record[kind];
              const response = await fetch(record.cloud[kind + "Url"]);
              if (!response.ok) throw Error("Image download failed");
              return response.blob();
            }),
          );
      const files = blobs.map(
        (blob, i) =>
          new File(
            [blob],
            `80th Anniv. My Trajectories${i ? " (2)" : ""}.png`,
            { type: "image/png" },
          ),
      );
      if (
        navigator.canShare?.({ files }) &&
        navigator.share &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      ) {
        await navigator.share({
          files,
          title: "나의 궤적 · Create Trajectories",
        });
        $("download-status").textContent =
          "공유 메뉴를 닫았습니다. 사진 앱에서 저장 여부를 확인해 주세요.";
      } else {
        for (const file of files) {
          const url = URL.createObjectURL(file),
            link = document.createElement("a");
          link.href = url;
          link.download = file.name;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        $("download-status").textContent =
          `이미지 ${files.length}장 다운로드를 요청했습니다.`;
      }
      if (state.screen === "finish") openCurrentRecord();
    } catch (error) {
      if (error.name === "AbortError")
        $("download-status").textContent =
          "저장을 취소했습니다. 다시 선택할 수 있어요.";
      else showError("이미지를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      controls.forEach((button) => (button.disabled = false));
      downloadInProgress = false;
    }
  }
  $("download").addEventListener("click", () => {
    $("download-status").textContent = "";
    $("download-dialog").showModal();
  });
  $("save-arrows").addEventListener("click", () =>
    saveImage(state.record, "arrows"),
  );
  $("save-poster").addEventListener("click", () =>
    saveImage(state.record, "poster"),
  );
  $("save-both").addEventListener("click", () =>
    saveImages(state.record, ["arrows", "poster"]),
  );
  function openCurrentRecord() {
    $("download-dialog").close();
    navigate("#archive");
  }
  $("download-done").addEventListener("click", openCurrentRecord);
  $("open-record").addEventListener("click", openCurrentRecord);
  const GALLERY_BATCH = 12;
  function ensureGalleryFilled() {
    if (
      state.screen !== "gallery" ||
      !state.galleryHasMore ||
      state.galleryLoading
    )
      return;
    const scroller = $("gallery-scroll");
    if (
      scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <
      300
    )
      void loadGallery();
  }
  async function loadGallery(reset = false) {
    if (!reset && (state.galleryLoading || !state.galleryHasMore)) return;
    const serial = reset ? ++gallerySerial : gallerySerial;
    if (reset) {
      state.galleryOffset = 0;
      state.galleryHasMore = true;
      state.galleryLoaded = false;
      state.galleryIds.clear();
      $("gallery-grid").replaceChildren();
      state.galleryUrls.forEach((url) => URL.revokeObjectURL(url));
      state.galleryUrls = [];
      $("gallery-scroll").scrollTop = 0;
    }
    state.galleryLoading = true;
    $("gallery-more").hidden = true;
    $("gallery-status").textContent = "궤적을 불러오고 있어요…";
    try {
      let rows, hasMore;
      if (archive.configured()) {
        const result = await archive.onlineList(
          state.galleryOffset,
          GALLERY_BATCH,
        );
        rows = result.items;
        hasMore = result.hasMore;
      } else {
        const result = await archive.localList(
          state.galleryOffset,
          GALLERY_BATCH,
        );
        if (serial !== gallerySerial || state.screen !== "gallery") return;
        hasMore = result.hasMore;
        rows = result.items.map((record) => {
          const photoUrl = URL.createObjectURL(record.photo),
            arrowsUrl = URL.createObjectURL(record.arrows);
          state.galleryUrls.push(photoUrl, arrowsUrl);
          return {
            id: record.id,
            createdAt: record.createdAt,
            photoUrl,
            arrowsUrl,
          };
        });
      }
      if (serial !== gallerySerial || state.screen !== "gallery") return;
      state.galleryOffset += rows.length;
      state.galleryHasMore = hasMore;
      state.galleryLoaded = true;
      for (const row of rows) {
        // Offset reads can overlap if another participant publishes while this viewer scrolls.
        if (state.galleryIds.has(row.id)) continue;
        state.galleryIds.add(row.id);
        const card = document.createElement("button");
        card.className = "archive-card";
        card.dataset.recordId = row.id;
        card.setAttribute(
          "aria-label",
          dateStamp(row.createdAt) + " 궤적. 사진과 궤적 함께 보기",
        );
        let photo;
        for (const [kind, src] of [
          ["arrows", row.arrowsUrl],
          ["photo", row.photoUrl],
        ]) {
          const image = new Image();
          image.loading = "lazy";
          image.decoding = "async";
          if (kind === "arrows") image.src = src;
          else {
            photo = image;
            image.dataset.src = src;
          }
          image.alt =
            kind === "arrows"
              ? "참여자가 만든 궤적과 날짜"
              : "궤적의 바탕이 된 사진";
          image.className = "archive-" + kind;
          image.draggable = false;
          card.append(image);
        }
        const revealPhoto = () => {
          if (!photo.hasAttribute("src")) {
            photo.onload = () => card.classList.add("is-photo-ready");
            photo.onerror = () => photo.removeAttribute("src");
            photo.src = photo.dataset.src;
          }
        };
        card.addEventListener("pointerenter", revealPhoto);
        card.addEventListener("focus", revealPhoto);
        let pressedAt = 0;
        card.addEventListener("pointerdown", () => {
          revealPhoto();
          pressedAt = performance.now();
          card.classList.add("is-pressed");
        });
        for (const type of ["pointerup", "pointercancel", "pointerleave"])
          card.addEventListener(type, () =>
            card.classList.remove("is-pressed"),
          );
        card.addEventListener("click", (event) => {
          if (event.detail > 0 && performance.now() - pressedAt > 350) return;
          navigate("#result/" + row.id);
        });
        card.addEventListener("contextmenu", (event) => event.preventDefault());
        $("gallery-grid").append(card);
      }
      $("gallery-status").textContent = state.galleryIds.size
        ? ""
        : "아직 공개된 궤적이 없습니다.";
      $("gallery-more").hidden = !hasMore;
    } catch {
      if (serial !== gallerySerial) return;
      $("gallery-status").textContent =
        "아카이브를 불러오지 못했어요. 다시 시도해 주세요.";
      $("gallery-more").hidden = false;
    } finally {
      if (serial === gallerySerial) {
        state.galleryLoading = false;
        // Fill tall screens without relying on a scroll event or loading every record at once.
        if ($("gallery-status").textContent === "")
          requestAnimationFrame(ensureGalleryFilled);
      }
    }
  }
  $("gallery-scroll").addEventListener("scroll", ensureGalleryFilled, {
    passive: true,
  });
  $("gallery-more").addEventListener("click", () => loadGallery());
  async function updateRecordNeighbors(record, serial) {
    try {
      const ids = [...state.galleryIds],
        index = ids.indexOf(record.id);
      const neighbors =
        index >= 0 && (index + 1 < ids.length || !state.galleryHasMore)
          ? { previous: ids[index - 1] || null, next: ids[index + 1] || null }
          : await (archive.configured() && record.cloud
              ? archive.onlineNeighbors(record)
              : archive.localNeighbors(record.id));
      if (serial !== recordSerial || state.screen !== "record") return;
      state.recordNeighbors = neighbors;
      $("record-prev").disabled = !neighbors.previous;
      $("record-next").disabled = !neighbors.next;
    } catch {
      if (serial === recordSerial)
        $("record-description").textContent =
          "게시물 이동을 불러오지 못했습니다.";
    }
  }
  $("record-prev").addEventListener("click", () => {
    if (state.recordNeighbors.previous)
      navigate("#result/" + state.recordNeighbors.previous);
  });
  $("record-next").addEventListener("click", () => {
    if (state.recordNeighbors.next)
      navigate("#result/" + state.recordNeighbors.next);
  });
  async function loadRecord(id) {
    const serial = recordSerial;
    state.viewedRecord = null;
    $("delete-record").hidden = true;
    state.recordNeighbors = { previous: null, next: null };
    $("record-prev").disabled = true;
    $("record-next").disabled = true;
    $("record-images").hidden = true;
    $("retry-cloud").hidden = true;
    $("record-description").textContent = "궤적을 불러오고 있어요…";
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      $("record-description").textContent = "올바르지 않은 결과 주소입니다.";
      return;
    }
    let record = state.record?.id === id ? state.record : null;
    try {
      record ||= await archive.localGet(id);
    } catch {}
    try {
      if (!record && archive.configured()) record = await archive.onlineGet(id);
    } catch {
      if (serial === recordSerial)
        $("record-description").textContent =
          "온라인 기록을 불러오지 못했어요. 연결 상태를 확인하고 다시 열어 주세요.";
      return;
    }
    if (serial !== recordSerial) return;
    if (!record) {
      $("record-description").textContent =
        "이 기기에서 기록을 찾을 수 없어요. 온라인에 저장되지 않은 기록은 생성한 브라우저에서만 볼 수 있습니다.";
      return;
    }
    state.viewedRecord = record;
    state.recordUrls.forEach((url) => URL.revokeObjectURL(url));
    state.recordUrls = [];
    for (const [kind, element] of [
      ["photo", "record-photo"],
      ["arrows", "record-arrows"],
    ]) {
      let src = record[kind]
        ? URL.createObjectURL(record[kind])
        : record.cloud[kind + "Url"];
      if (record[kind]) state.recordUrls.push(src);
      $(element).src = src;
    }
    $("record-images").hidden = Boolean(record.deletionPending);
    $("record-description").textContent = "";
    updateDeleteButton();
    requestAnimationFrame(fitRecordPhoto);
    if (record.deletionPending)
      showError(
        "이전에 시작한 삭제가 완료되지 않았습니다. 삭제 버튼을 눌러 다시 시도해 주세요.",
      );
    void updateRecordNeighbors(record, serial);
    $("retry-cloud").hidden =
      !archive.configured() ||
      Boolean(record.cloud) ||
      state.saveState.cloud === "pending";
    randomizeButtons();
  }
  function updateDeleteButton() {
    const record = state.viewedRecord;
    const saving =
      record?.id === state.record?.id && state.saveState.cloud === "pending";
    $("delete-record").hidden =
      !archive.canDelete(record) || saving || state.deleting;
  }
  addEventListener("trajectory-session-change", updateDeleteButton);
  addEventListener("pageshow", updateDeleteButton);
  addEventListener("focus", updateDeleteButton);
  let deletionTarget = null;
  $("delete-record").addEventListener("click", () => {
    const record = state.viewedRecord;
    if (!archive.canDelete(record) || state.deleting) return;
    deletionTarget = record;
    $("delete-description").textContent = archive.configured()
      ? "사진·궤적·포스터가 이 브라우저와 온라인 아카이브에서 삭제됩니다. 삭제 후에는 되돌릴 수 없습니다."
      : "사진·궤적·포스터가 이 브라우저에서 삭제됩니다. 삭제 후에는 되돌릴 수 없습니다.";
    $("delete-progress").textContent = "";
    $("delete-dialog").showModal();
    $("cancel-delete").focus();
  });
  $("cancel-delete").addEventListener("click", () => {
    if (!state.deleting) $("delete-dialog").close();
  });
  $("delete-dialog").addEventListener("cancel", (event) => {
    if (state.deleting) event.preventDefault();
  });
  $("confirm-delete").addEventListener("click", async () => {
    if (!deletionTarget || state.deleting) return;
    const record = deletionTarget;
    state.deleting = true;
    $("confirm-delete").disabled = $("cancel-delete").disabled = true;
    $("delete-progress").textContent = "삭제하고 있습니다…";
    try {
      await archive.removeOwn(record);
      if (state.record?.id === record.id) {
        state.record = null;
        state.photo = null;
        if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
        state.photoUrl = null;
        $("photo-preview").removeAttribute("src");
        $("result-preview").removeAttribute("src");
        state.previewUrls.forEach(URL.revokeObjectURL);
        state.previewUrls = [];
      }
      deletionTarget = null;
      state.recordUrls.forEach(URL.revokeObjectURL);
      state.recordUrls = [];
      state.galleryLoaded = false;
      state.galleryScrollTop = 0;
      state.galleryIds.delete(record.id);
      $("delete-dialog").close();
      if (state.viewedRecord?.id === record.id) state.viewedRecord = null;
      if (state.screen === "record") navigate("#archive");
      else if (state.screen === "gallery") void loadGallery(true);
      status("게시물을 삭제했습니다.");
    } catch (error) {
      $("delete-progress").textContent =
        error.code === "session_unavailable"
          ? "사진을 만든 브라우저의 로그인 정보를 확인할 수 없어 삭제할 수 없습니다."
          : error.status === 404
            ? "Supabase 삭제 설정이 필요합니다. 설정 후 다시 시도해 주세요."
            : "삭제를 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.";
    } finally {
      state.deleting = false;
      $("confirm-delete").disabled = $("cancel-delete").disabled = false;
      updateDeleteButton();
    }
  });
  $("retry-cloud").addEventListener("click", async () => {
    const record = state.viewedRecord;
    if (!record?.photo) return;
    state.record = record;
    $("retry-cloud").disabled = true;
    try {
      await persist(record);
    } finally {
      $("retry-cloud").disabled = false;
      updateArchiveUI();
    }
  });
  $("dismiss-error").addEventListener("click", clearError);
  $("retry-error-save").addEventListener("click", () => {
    if (!state.record?.photo || state.saveState.cloud === "pending") return;
    clearError();
    void persist(state.record);
  });
  addEventListener("hashchange", route);
  randomizeHome();
  void backReady;
  void infoReady;
  void landingReady;
  void route();
  void archive
    .retryPendingDeletions()
    .then((results) => {
      const removed = new Set(
        results
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value),
      );
      if (removed.has(state.record?.id)) state.record = null;
      if (removed.has(state.viewedRecord?.id)) {
        state.viewedRecord = null;
        state.galleryLoaded = false;
        navigate("#archive");
      } else if (results.length && state.screen === "gallery")
        void loadGallery(true);
      if (results.some((result) => result.status === "rejected"))
        showError(
          "이전 게시물 삭제를 완료하지 못했습니다. 연결 상태를 확인한 뒤 사이트를 다시 열어 주세요.",
        );
    })
    .catch(() => {});
})();
