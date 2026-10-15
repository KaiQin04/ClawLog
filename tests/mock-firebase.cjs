// Runs only inside the isolated test page. Never makes network requests.
module.exports = function installFirebaseMock() {
  const users = new Map();
  const holds = new Map();
  let nextId = 0;
  let observer = null;
  const clone = (value) => value === undefined ? undefined : structuredClone(value);
  const userData = (uid) => {
    if (!users.has(uid)) users.set(uid, { settings: undefined, records: new Map() });
    return users.get(uid);
  };
  const wait = async (kind, uid) => {
    const hold = holds.get(`${kind}:${uid}`);
    if (hold) {
      hold.started = true;
      await hold.promise;
      holds.delete(`${kind}:${uid}`);
    }
  };
  const mock = {
    writes: [], recordWriteCount: 0, failSetNumber: 0, commitOnFailure: false,
    seed(uid, settings, records = []) {
      users.set(uid, {
        settings: clone(settings),
        records: new Map(records.map(({ id, ...record }) => [id, clone(record)])),
      });
    },
    dump(uid) {
      const data = userData(uid);
      return {
        settings: clone(data.settings),
        records: [...data.records].map(([id, record]) => ({ id, ...clone(record) })),
      };
    },
    hold(kind, uid) {
      let release;
      const promise = new Promise((resolve) => { release = resolve; });
      holds.set(`${kind}:${uid}`, { promise, release, started: false });
    },
    started(kind, uid) { return Boolean(holds.get(`${kind}:${uid}`)?.started); },
    release(kind, uid) { holds.get(`${kind}:${uid}`)?.release(); },
    async login(uid) {
      auth.currentUser = uid ? { uid, email: `${uid}@example.invalid` } : null;
      await observer?.(auth.currentUser);
    },
  };
  const auth = {
    currentUser: null,
    onAuthStateChanged(callback) { observer = callback; callback(null); },
    signInWithPopup() { return mock.login('A'); },
    async signOut() {
      if (mock.failSignOut) throw new Error('Mock sign-out failure');
      await mock.login(null);
    },
  };
  function collection(uid) {
    return {
      async get() {
        const docs = [...userData(uid).records].map(([id, record]) => ({
          id, data: () => clone(record),
        }));
        await wait('records', uid);
        return { docs };
      },
      doc(id = `mock-${++nextId}`) {
        return {
          id,
          async set(record) {
            mock.recordWriteCount += 1;
            const fail = mock.recordWriteCount === mock.failSetNumber;
            mock.writes.push({ kind: 'record-set', uid, id, record: clone(record) });
            await wait('write', uid);
            if (!fail || mock.commitOnFailure) userData(uid).records.set(id, clone(record));
            if (fail) throw new Error('Mock uncertain write failure');
          },
          async delete() {
            mock.writes.push({ kind: 'record-delete', uid, id });
            await wait('write', uid);
            userData(uid).records.delete(id);
          },
        };
      },
      async add(record) {
        const ref = this.doc();
        await ref.set(record);
        return ref;
      },
    };
  }
  const db = {
    collection(name) {
      if (name !== 'users') throw new Error('Unexpected collection');
      return {
        doc(uid) {
          return {
            async get() {
              const settings = clone(userData(uid).settings);
              await wait('settings', uid);
              return { exists: settings !== undefined, data: () => clone(settings) };
            },
            async set(settings) {
              mock.writes.push({ kind: 'settings-set', uid, settings: clone(settings) });
              await wait('settings-write', uid);
              userData(uid).settings = { ...userData(uid).settings, ...clone(settings) };
            },
            collection(name) {
              if (name !== 'records') throw new Error('Unexpected subcollection');
              return collection(uid);
            },
          };
        },
      };
    },
  };
  const authFactory = () => auth;
  authFactory.GoogleAuthProvider = class {};
  window.firebase = { auth: authFactory, firestore: () => db };
  window.mock = mock;
};
