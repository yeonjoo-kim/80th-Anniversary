/* Atomic local archive and Supabase REST adapter. No external SDK is required. */
(() => {
  "use strict";
  const DB_NAME = "snu-art-80",
    STORE = "creations";
  const SESSION_KEY = "trajectory-supabase-session-v1";
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let databasePromise, authPromise, session, storedSessionValue;
  const saving = new Set();
  const config = () => window.SUPABASE_CONFIG;
  const configured = () =>
    Boolean(config()?.url && config()?.publishableKey && config()?.bucket);
  function database() {
    if (!databasePromise)
      databasePromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 2);
        req.onupgradeneeded = () => {
          const store = req.result.objectStoreNames.contains(STORE)
            ? req.transaction.objectStore(STORE)
            : req.result.createObjectStore(STORE, { keyPath: "id" });
          if (!store.indexNames.contains("createdAt"))
            store.createIndex("createdAt", "createdAt");
        };
        req.onsuccess = () => {
          req.result.onversionchange = () => req.result.close();
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
      }).catch((error) => {
        databasePromise = null;
        throw error;
      });
    return databasePromise;
  }
  async function localSave(record) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Local save aborted"));
    });
  }
  async function storedRecord(id) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function localGet(id) {
    const record = await storedRecord(id);
    return record?.deleted ? null : record;
  }
  async function localList(offset = 0, limit = 6) {
    const db = await database();
    offset = Math.max(0, Math.floor(offset));
    limit = Math.max(1, Math.min(24, Math.floor(limit)));
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE)
        .objectStore(STORE)
        .index("createdAt")
        .openCursor(null, "prev");
      const items = [];
      let skipped = 0;
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve({ items, hasMore: false });
          return;
        }
        if (cursor.value.deleted || cursor.value.deletionPending) {
          cursor.continue();
          return;
        }
        if (skipped < offset) {
          skipped++;
          cursor.continue();
          return;
        }
        if (items.length === limit) {
          resolve({ items, hasMore: true });
          return;
        }
        items.push(cursor.value);
        cursor.continue();
      };
    });
  }
  async function localNeighbors(id) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE)
        .objectStore(STORE)
        .index("createdAt")
        .openCursor(null, "prev");
      let previous = null,
        found = false;
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve({ previous: found ? previous : null, next: null });
          return;
        }
        if (cursor.value.deleted || cursor.value.deletionPending) {
          cursor.continue();
          return;
        }
        if (found) {
          resolve({ previous, next: cursor.primaryKey });
          return;
        }
        if (cursor.primaryKey === id) found = true;
        else previous = cursor.primaryKey;
        cursor.continue();
      };
    });
  }
  function baseURL() {
    if (!configured()) throw new Error("supabase/not-configured");
    const url = new URL(config().url);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co"))
      throw new Error("Invalid Supabase URL");
    return url.origin;
  }
  async function request(path, { token, headers, ...options } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(baseURL() + path, {
        ...options,
        credentials: "omit",
        signal: controller.signal,
        headers: {
          apikey: config().publishableKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
      });
      if (!response.ok) {
        let detail = {};
        try {
          detail = await response.json();
        } catch {}
        const error = new Error(
          detail.msg || detail.message || "Online archive request failed",
        );
        error.code =
          detail.code || detail.error_code || String(response.status);
        error.status = response.status;
        throw error;
      }
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(timer);
    }
  }
  function rememberSession(value) {
    if (
      !value?.access_token ||
      !value.refresh_token ||
      !UUID.test(value.user?.id) ||
      !(value.expires_at || value.expires_in)
    ) {
      throw new Error("Invalid anonymous session");
    }
    session = {
      access_token: value.access_token,
      refresh_token: value.refresh_token,
      expires_at:
        value.expires_at || Math.floor(Date.now() / 1000) + value.expires_in,
      user: { id: value.user.id },
    };
    try {
      const value = JSON.stringify(session);
      localStorage.setItem(SESSION_KEY, value);
      storedSessionValue = value;
    } catch {}
    return session;
  }
  function readSession() {
    try {
      const value = localStorage.getItem(SESSION_KEY);
      if (value !== storedSessionValue) {
        session = JSON.parse(value);
        storedSessionValue = value;
      }
    } catch {}
    return session;
  }
  addEventListener("storage", (event) => {
    if (event.key !== SESSION_KEY && event.key !== null) return;
    readSession();
    dispatchEvent(new Event("trajectory-session-change"));
  });
  function currentUserId() {
    readSession();
    return UUID.test(session?.user?.id) ? session.user.id : null;
  }
  async function authenticatedSession({ create = true } = {}) {
    if (authPromise) return authPromise;
    authPromise = (async () => {
      readSession();
      if (
        session?.access_token &&
        UUID.test(session.user?.id) &&
        session.expires_at > Date.now() / 1000 + 60
      )
        return session;
      if (session?.refresh_token) {
        try {
          return rememberSession(
            await request("/auth/v1/token?grant_type=refresh_token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refresh_token: session.refresh_token }),
            }),
          );
        } catch (error) {
          if (error.status !== 400 && error.status !== 401) throw error;
          session = null;
          try {
            localStorage.removeItem(SESSION_KEY);
          } catch {}
        }
      }
      if (!create) {
        const error = new Error("기존 로그인 정보를 확인할 수 없습니다.");
        error.code = "session_unavailable";
        throw error;
      }
      // A publishable key identifies the app. Anonymous Auth grants this visitor a private upload identity.
      return rememberSession(
        await request("/auth/v1/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      );
    })();
    try {
      return await authPromise;
    } finally {
      authPromise = null;
    }
  }
  function imageURL(path) {
    const segments = path.split("/");
    if (
      segments.length !== 3 ||
      !UUID.test(segments[0]) ||
      !UUID.test(segments[1]) ||
      !["photo.jpg", "arrows.png", "poster.png"].includes(segments[2])
    )
      throw new Error("Invalid archive image path");
    return (
      baseURL() +
      "/storage/v1/object/public/" +
      encodeURIComponent(config().bucket) +
      "/" +
      segments.map(encodeURIComponent).join("/")
    );
  }
  function cloudFromRow(row) {
    if (!UUID.test(row.id) || !Number.isFinite(Date.parse(row.captured_at)))
      throw new Error("Invalid archive record");
    const paths = {
      photo: row.photo_path,
      arrows: row.arrows_path,
      poster: row.poster_path,
    };
    const cloud = { provider: "supabase" };
    for (const [kind, path] of Object.entries(paths)) {
      if (
        path.split("/")[1] !== row.id ||
        !path.endsWith(kind === "photo" ? "/photo.jpg" : `/${kind}.png`)
      )
        throw new Error("Invalid archive record path");
      cloud[kind + "Url"] = imageURL(path);
    }
    return cloud;
  }
  async function onlineSave(record) {
    if (saving.has(record.id)) throw new Error("Save already in progress");
    saving.add(record.id);
    try {
      return await uploadRecord(record);
    } finally {
      saving.delete(record.id);
    }
  }
  async function uploadRecord(record) {
    if (!UUID.test(record.id)) throw new Error("Invalid record ID");
    const stored = await storedRecord(record.id);
    if (stored?.deletionPending || stored?.deleted)
      throw new Error("Deletion is pending or complete");
    const auth = await authenticatedSession();
    record.ownerId = auth.user.id;
    try {
      await localSave(record);
    } catch {}
    const files = {
      photo: ["photo.jpg", record.photo],
      arrows: ["arrows.png", record.arrows],
      poster: ["poster.png", record.poster],
    };
    const paths = {};
    // Wait for every upload to settle before retrying or publishing a completed result.
    const uploads = await Promise.allSettled(
      Object.entries(files).map(async ([kind, [filename, blob]]) => {
        const path = `${auth.user.id}/${record.id}/${filename}`;
        await request(
          `/storage/v1/object/${encodeURIComponent(config().bucket)}/${path}`,
          {
            token: auth.access_token,
            method: "POST",
            body: blob,
            headers: {
              "Content-Type": blob.type,
              "Cache-Control": "max-age=3600",
              "x-upsert": "true",
            },
          },
        );
        paths[kind + "_path"] = path;
      }),
    );
    const failure = uploads.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
    const row = {
      id: record.id,
      owner_id: auth.user.id,
      captured_at: record.createdAt,
      ready: true,
      ...paths,
    };
    await request("/rest/v1/creations?on_conflict=id", {
      token: auth.access_token,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
    record.cloud = cloudFromRow(row);
    return record;
  }
  async function onlineGet(id) {
    if (!UUID.test(id)) throw new Error("Invalid record ID");
    // Only an exact random result ID can be looked up; no anonymous account or list access is needed.
    const rows = await request("/rest/v1/rpc/get_creation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_id: id }),
    });
    if (!Array.isArray(rows) || !rows.length) return null;
    const row = rows[0];
    if (row.id !== id) throw new Error("Unexpected archive record");
    return { id, createdAt: row.captured_at, cloud: cloudFromRow(row) };
  }
  async function onlineList(offset = 0, limit = 6) {
    offset = Math.max(0, Math.min(100000, Math.floor(offset)));
    limit = Math.max(1, Math.min(24, Math.floor(limit)));
    const rows = await request("/rest/v1/rpc/list_trajectories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_offset: offset, p_limit: limit + 1 }),
    });
    if (!Array.isArray(rows)) throw new Error("Invalid archive response");
    const items = rows.slice(0, limit).map((row) => {
      if (!UUID.test(row.id) || !Number.isFinite(Date.parse(row.captured_at)))
        throw new Error("Invalid archive record");
      const photo = row.photo_path,
        arrows = row.arrows_path;
      if (
        typeof photo !== "string" ||
        typeof arrows !== "string" ||
        photo.split("/")[1] !== row.id ||
        arrows.split("/")[1] !== row.id ||
        photo.split("/")[0] !== arrows.split("/")[0] ||
        !photo.endsWith("/photo.jpg") ||
        !arrows.endsWith("/arrows.png")
      )
        throw new Error("Invalid archive image path");
      return {
        id: row.id,
        createdAt: row.captured_at,
        photoUrl: imageURL(photo),
        arrowsUrl: imageURL(arrows),
      };
    });
    return { items, hasMore: rows.length > limit };
  }
  async function onlineNeighbors(record) {
    const first = await onlineList(0, 24);
    let index = first.items.findIndex((row) => row.id === record.id);
    if (index >= 0) {
      const next =
        first.items[index + 1]?.id ||
        (first.hasMore ? (await onlineList(24, 1)).items[0]?.id : null);
      return {
        previous: first.items[index - 1]?.id || null,
        next: next || null,
      };
    }
    if (!first.hasMore) return { previous: null, next: null };
    const compare = (row) => {
      const date = Date.parse(row.createdAt) - Date.parse(record.createdAt);
      if (date) return date > 0 ? -1 : 1;
      return row.id === record.id ? 0 : row.id > record.id ? -1 : 1;
    };
    // Existing public RPC supports bounded offsets: find older direct links without downloading the entire archive.
    let low = 24,
      high = 48;
    while (true) {
      const row = (await onlineList(high, 1)).items[0];
      if (!row || compare(row) > 0) break;
      if (compare(row) === 0) {
        index = high;
        break;
      }
      if (high === 100000) return { previous: null, next: null };
      low = high + 1;
      high = Math.min(100000, high * 2);
    }
    while (index < 0 && low <= high) {
      const mid = Math.floor((low + high) / 2),
        row = (await onlineList(mid, 1)).items[0];
      if (!row || compare(row) > 0) high = mid - 1;
      else if (compare(row) < 0) low = mid + 1;
      else index = mid;
    }
    if (index < 0) return { previous: null, next: null };
    const nearby = (await onlineList(Math.max(0, index - 1), 3)).items;
    const current = nearby.findIndex((row) => row.id === record.id);
    return {
      previous: nearby[current - 1]?.id || null,
      next: current < 0 ? null : nearby[current + 1]?.id || null,
    };
  }
  function canDelete(record) {
    if (!record || !UUID.test(record.id) || saving.has(record.id)) return false;
    if (!configured())
      return Boolean(record.photo && record.arrows && record.poster);
    const uid = currentUserId();
    if (record.cloud) {
      try {
        const expected = `${baseURL()}/storage/v1/object/public/${encodeURIComponent(config().bucket)}/${uid}/${record.id}/photo.jpg`;
        return Boolean(uid && record.cloud.photoUrl === expected);
      } catch {
        return false;
      }
    }
    return Boolean(record.photo && (!record.ownerId || record.ownerId === uid));
  }
  async function localRemove(record) {
    // Keep only a tiny tombstone: no photo blobs or cloud paths remain locally.
    await localSave({
      id: record.id,
      createdAt: record.createdAt,
      deleted: true,
    });
  }
  async function removeOwn(record) {
    if (!canDelete(record))
      throw new Error("이 게시물을 만든 브라우저에서만 삭제할 수 있습니다.");
    if (saving.has(record.id))
      throw new Error("저장이 끝난 뒤 다시 시도해 주세요.");
    if (
      !configured() ||
      (!record.cloud && !currentUserId() && !record.ownerId)
    ) {
      await localRemove(record);
      return;
    }
    const auth = await authenticatedSession({ create: false });
    if (record.cloud && !canDelete(record))
      throw new Error("게시물의 로그인 정보가 다릅니다.");
    const previous = await localGet(record.id);
    const pending = { ...record, deletionPending: true, ownerId: auth.user.id };
    await localSave(pending);
    let prepared = false;
    try {
      const rows = await request("/rest/v1/rpc/prepare_creation_deletion", {
        token: auth.access_token,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_id: record.id }),
      });
      prepared = true;
      const prefix = `${auth.user.id}/${record.id}/`;
      const paths = ["photo.jpg", "arrows.png", "poster.png"].map(
        (name) => prefix + name,
      );
      if (
        rows?.length &&
        [rows[0].photo_path, rows[0].arrows_path, rows[0].poster_path].some(
          (path, i) => path !== paths[i],
        )
      )
        throw new Error("Invalid deletion paths");
      await request(
        `/storage/v1/object/${encodeURIComponent(config().bucket)}`,
        {
          token: auth.access_token,
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: paths }),
        },
      );
      const finished = await request("/rest/v1/rpc/finish_creation_deletion", {
        token: auth.access_token,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_id: record.id }),
      });
      if (finished !== true) throw new Error("Deletion did not finish");
      await localRemove(record);
    } catch (error) {
      if (!prepared && [400, 401, 403, 404].includes(error.status)) {
        if (previous) await localSave(previous);
        else await localRemove(record);
      }
      throw error;
    }
  }
  async function pendingDeletions() {
    const db = await database();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).getAll();
      request.onsuccess = () =>
        resolve(request.result.filter((record) => record.deletionPending));
      request.onerror = () => reject(request.error);
    });
  }
  async function retryPendingDeletions() {
    const pending = await pendingDeletions();
    return Promise.allSettled(
      pending.filter(canDelete).map(async (record) => {
        await removeOwn(record);
        return record.id;
      }),
    );
  }
  window.trajectoryArchive = {
    configured,
    canDelete,
    removeOwn,
    retryPendingDeletions,
    localSave,
    localGet,
    localList,
    localNeighbors,
    onlineSave,
    onlineGet,
    onlineList,
    onlineNeighbors,
  };
})();
