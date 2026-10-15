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
  };
  let stripeOrder = [],
    processTimer,
    audioContext,
    lastFeedback = 0,
    recordSerial = 0;
  let feedbackEnabled = true;
  try {
    feedbackEnabled = localStorage.getItem("trajectory-feedback") !== "off";
  } catch {}

  function status(message) {
    $("status").textContent = message;
  }
  function showError(message) {
    $("error-message").textContent = message;
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
  }
  function drawStripes() {
    $("stripe-field").replaceChildren(
      ...stripeOrder.map((color) => {
        const stripe = document.createElement("div");
        stripe.className = "stripe";
        stripe.style.backgroundColor = cssColor(color);
        return stripe;
      }),
    );
    $("take-photo").style.color = ink(stripeOrder[3]);
    $("choose-photo").style.color = ink(stripeOrder[4]);
  }
  function randomizeHome() {
    stripeOrder = shuffle(palette);
    drawStripes();
    randomizeButtons();
  }
  function feedback(index = 0) {
    if (!feedbackEnabled || performance.now() - lastFeedback < 65) return;
    lastFeedback = performance.now();
    try {
      navigator.vibrate?.(9);
    } catch {}
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioContext ||= new AudioCtor();
      if (audioContext.state === "suspended")
        audioContext.resume().catch(() => {});
      const oscillator = audioContext.createOscillator(),
        gain = audioContext.createGain(),
        time = audioContext.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(300 + index * 55, time);
      oscillator.frequency.exponentialRampToValueAtTime(
        180 + index * 35,
        time + 0.055,
      );
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.045, time + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.08);
    } catch {}
  }
  function updateFeedback() {
    const b = $("feedback-toggle");
    b.setAttribute("aria-pressed", String(feedbackEnabled));
    b.setAttribute(
      "aria-label",
      feedbackEnabled ? "소리와 진동 끄기" : "소리와 진동 켜기",
    );
    b.textContent = feedbackEnabled ? "소리·진동 켜짐" : "소리·진동 꺼짐";
  }
  document.addEventListener(
    "click",
    (event) => {
      if (
        event.target.closest("button") &&
        event.target.closest("button") !== $("feedback-toggle")
      )
        feedback();
    },
    true,
  );
  $("feedback-toggle").addEventListener("click", () => {
    feedbackEnabled = !feedbackEnabled;
    try {
      localStorage.setItem(
        "trajectory-feedback",
        feedbackEnabled ? "on" : "off",
      );
    } catch {}
    updateFeedback();
    if (feedbackEnabled) feedback();
  });

  let pointer = null;
  $("stripe-field").addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, steps: 0 };
    $("stripe-field").setPointerCapture(event.pointerId);
    feedback();
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
    feedback((step + 80) % 8);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    $("stripe-field").addEventListener(event, () => {
      pointer = null;
    });

  function displayScreen(name) {
    for (const id of screens) $(id).hidden = id !== name;
    state.screen = name;
    $(name).setAttribute("tabindex", "-1");
    $(name).focus({ preventScroll: true });
    document.querySelector(".settings").hidden = name === "processing";
    document
      .querySelector(".settings")
      .classList.toggle("over-photo", name === "photo");
    window.scrollTo(0, 0);
  }
  function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }
  function updateNotice() {
    $("save-notice").textContent = archive.configured()
      ? "그리기를 누르면 사진과 생성 이미지가 작품 기록에 저장됩니다. 결과 링크를 아는 사람은 사진과 궤적을 볼 수 있어요."
      : "사진과 결과는 이 브라우저에 저장됩니다. 온라인 기록은 아직 연결되지 않았어요.";
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
    if (
      state.screen === "record" &&
      state.viewedRecord?.id === state.record?.id
    ) {
      $("record-description").textContent = recordDescription(
        state.viewedRecord,
      );
      $("share-record").hidden = !state.viewedRecord.cloud;
      $("retry-cloud").hidden =
        !archive.configured() ||
        Boolean(state.viewedRecord.cloud) ||
        state.saveState.cloud === "pending";
    }
  }
  async function route() {
    recordSerial++;
    if (state.busy && state.screen === "processing") {
      state.serial++;
      state.busy = false;
      clearInterval(processTimer);
    }
    const hash = location.hash;
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
      updateNotice();
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
  $("choose-photo").addEventListener("click", () => $("library-file").click());
  $("replace-photo").addEventListener("click", () => $("library-file").click());

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
      $("photo-preview").src = state.photoUrl;
      randomizeButtons();
      updateNotice();
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
    img.src = `assets/process-${i}.svg`;
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
  const routes = [
    [
      [62, 407],
      [154, 407],
      [154, 215],
    ],
    [
      [62, 407],
      [154, 407],
      [246, 225],
    ],
    [
      [62, 407],
      [344, 407],
    ],
    [
      [62, 407],
      [154, 407],
      [275, 525],
    ],
    [
      [62, 407],
      [154, 407],
      [154, 595],
    ],
    [
      [62, 407],
      [154, 407],
      [65, 530],
    ],
    [
      [62, 407],
      [154, 407],
      [154, 345],
      [65, 345],
    ],
    [
      [62, 407],
      [154, 407],
      [154, 330],
      [67, 245],
    ],
  ];
  function arrowMarkup(result) {
    return result.active
      .map((arrow) => {
        const pts = routes[arrow.dir].map((p) => [...p]);
        // Measured color centroid changes the final arrow's reach without leaving the poster margins.
        const variation = Math.max(
          -12,
          Math.min(12, (arrow.coverage - 0.2) * 32),
        );
        const tip = pts.at(-1),
          before = pts.at(-2);
        let dx = tip[0] - before[0],
          dy = tip[1] - before[1],
          len = Math.hypot(dx, dy);
        const ux = dx / len,
          uy = dy / len;
        tip[0] += ux * variation;
        tip[1] += uy * variation;
        const path = pts.map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" "),
          x = tip[0],
          y = tip[1],
          head = 28,
          wing = 26;
        const headPath = `M${x - ux * head - uy * wing} ${y - uy * head + ux * wing}L${x} ${y}L${x - ux * head + uy * wing} ${y - uy * head - ux * wing}`;
        return `<g fill="none" stroke="${arrow.hex}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" opacity="${arrow.opacity}"><path d="${path}"/><path d="${headPath}"/></g>`;
      })
      .join("");
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
        return doc.documentElement.innerHTML;
      })
      .catch((error) => {
        posterTypePromise = null;
        throw error;
      }));
  }
  async function artifact(result, createdAt, photo, withType) {
    const type = withType ? await posterType() : "";
    const thumbnail = withType
      ? `<image x="61" y="544" width="37" height="56" preserveAspectRatio="xMidYMid slice" href="${await dataURL(photo)}"/>`
      : "";
    const date = `<text x="256" y="594" transform="rotate(-30 256 594)" fill="#4400FF" font-family="Georgia,serif" font-size="25">${dateStamp(createdAt)}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1206" height="1560" viewBox="0 140 402 520"><rect x="0" y="140" width="402" height="520" fill="#EEEEEF"/>${arrowMarkup(result)}${type}${thumbnail}${date}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const image = await loadImage(url),
        c = canvas(1206, 1560);
      c.getContext("2d").drawImage(image, 0, 0, 1206, 1560);
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
    $("view-arrows").setAttribute("aria-pressed", String(kind === "arrows"));
    $("view-poster").setAttribute("aria-pressed", String(kind === "poster"));
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
    if (!archive.configured()) return;
    try {
      await archive.onlineSave(record);
      try {
        await archive.localSave(record);
      } catch {}
      if (state.record?.id === record.id) {
        state.saveState.cloud = "saved";
        updateArchiveUI();
      }
    } catch (error) {
      if (state.record?.id === record.id) {
        state.saveState.cloud = "failed";
        updateArchiveUI();
        showError(
          "온라인 저장을 완료하지 못했어요. 결과 페이지에서 다시 시도할 수 있습니다.",
        );
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
  $("view-arrows").addEventListener("click", () => setPreview("arrows"));
  $("view-poster").addEventListener("click", () => setPreview("poster"));
  $("restart").addEventListener("click", () => {
    randomizeHome();
    navigate("#home");
  });

  let downloadInProgress = false;
  async function saveImage(record, kind) {
    if (downloadInProgress || !record) return;
    downloadInProgress = true;
    clearError();
    try {
      let blob = record[kind];
      if (!blob) {
        const response = await fetch(record.cloud[kind + "Url"]);
        if (!response.ok) throw Error("Image download failed");
        blob = await response.blob();
      }
      const filename = `snu-art-80-${kind}-${dateStamp(record.createdAt).replaceAll("/", "-")}.png`,
        file = new File([blob], filename, { type: "image/png" });
      // Call the share API immediately when the local blob is ready, preserving user activation on iOS.
      if (
        navigator.canShare?.({ files: [file] }) &&
        navigator.share &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      ) {
        await navigator.share({
          files: [file],
          title: "나의 궤적 · Create Trajectories",
        });
        $("download-status").textContent =
          "공유 메뉴를 닫았습니다. 사진 앱에서 저장 여부를 확인해 주세요.";
      } else {
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        $("download-status").textContent =
          "이미지 다운로드를 요청했습니다. 결과 페이지에서 다른 이미지도 저장할 수 있어요.";
      }
      if (state.screen === "finish") openCurrentRecord();
    } catch (error) {
      if (error.name === "AbortError")
        $("download-status").textContent =
          "저장을 취소했습니다. 다시 선택할 수 있어요.";
      else showError("이미지를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
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
  function openCurrentRecord() {
    $("download-dialog").close();
    if (state.record) navigate("#result/" + state.record.id);
  }
  $("download-done").addEventListener("click", openCurrentRecord);
  $("open-record").addEventListener("click", openCurrentRecord);
  function recordDescription(record) {
    if (record.cloud)
      return `${dateStamp(record.createdAt)}\n사진에서 출발한 나의 궤적. 이 링크로 언제든 다시 볼 수 있어요.`;
    if (state.record?.id === record.id && state.saveState.cloud === "pending")
      return `${dateStamp(record.createdAt)}\n온라인 저장 중입니다. 이 페이지를 잠시 열어 두세요.`;
    if (state.record?.id === record.id && !state.saveState.local)
      return `${dateStamp(record.createdAt)}\n이 탭에서만 볼 수 있는 기록입니다. 이미지 다운로드로 보관해 주세요.`;
    return `${dateStamp(record.createdAt)}\n이 브라우저에 보관된 기록입니다. 다른 기기에서는 열리지 않으며, 브라우저 데이터를 지우면 삭제됩니다.`;
  }
  async function loadRecord(id) {
    const serial = recordSerial;
    state.viewedRecord = null;
    $("record-images").hidden = true;
    $("share-record").hidden = true;
    $("retry-cloud").hidden = true;
    $("record-description").textContent = "나의 궤적을 불러오고 있어요…";
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
    $("record-images").hidden = false;
    $("record-description").textContent = recordDescription(record);
    $("share-record").hidden = !record.cloud;
    $("retry-cloud").hidden =
      !archive.configured() ||
      Boolean(record.cloud) ||
      state.saveState.cloud === "pending";
    randomizeButtons();
  }
  $("record-download-arrows").addEventListener("click", () =>
    saveImage(state.viewedRecord, "arrows"),
  );
  $("record-download-poster").addEventListener("click", () =>
    saveImage(state.viewedRecord, "poster"),
  );
  $("share-record").addEventListener("click", async () => {
    if (!state.viewedRecord?.cloud) return;
    try {
      await navigator.clipboard.writeText(location.href);
      $("share-record").textContent = "복사됨 ✓";
    } catch {
      showError("주소 표시줄의 링크를 복사해 주세요.");
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
  addEventListener("hashchange", route);
  randomizeHome();
  updateNotice();
  updateFeedback();
  void infoReady;
  void route();
})();
