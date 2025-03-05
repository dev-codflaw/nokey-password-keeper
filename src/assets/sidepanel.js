document.addEventListener("alpine:init", () => {
  Alpine.data("spm", () => {
    return {
      dbName: "juasnpk",
      dbConnection: null,
      spm_pwlist_html: "",
      isModalOpen: false,
      showError: false,
      showSuccess: false,

      async init() {
        await this.initApp();
      },

      // initialize app and create a db connection
      initApp() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(this.dbName, 1);
          request.onerror = (event) => {
            console.error("Database error:", event.target.error);
            reject(event.target.error);
          };
          request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const objectStore = db.createObjectStore("pwlist", { keyPath: "id", autoIncrement: true });
            objectStore.createIndex("name", "name", { unique: false });
            objectStore.transaction.oncomplete = () => {
              console.log("DB created successfully");
            };
          };
          request.onsuccess = (event) => {
            const db = event.target.result;
            this.dbConnection = db;
            this.initAppData();
            resolve();
          };
        });
      },

      // fetch data from IndexedDB and render HTML
      initAppData() {
        this.spm_pwlist_html = "";
        const transaction = this.dbConnection.transaction("pwlist", "readonly");
        const pwListStore = transaction.objectStore("pwlist");
        pwListStore.getAll().onsuccess = async (event) => {
          let pwList = event.target.result.reverse();
          let html = "";
          pwList.forEach((record) => {
            html += this.renderRecord(record);
          });
          this.spm_pwlist_html = html;
        };
      },

      // generate HTML for a password record with escaped values
      renderRecord(record) {
        let urlHtml = `<span class="name">${this.escapeHTML(record.name)}</span>`;
        if (record.url && record.url.trim() !== '') {
          urlHtml = `<span class="name"><a href="${this.escapeHTML(record.url)}" target="_blank">${urlHtml}</a></span>`;
        }
        return `
        <div class="entry" spwid="${record.id}">
          <div class="field">
            ${urlHtml}
            <button class="edit-btn">
              <span class="material-icons" x-on:click="editEntry" data-spkdata='${this.safeStringify(record)}'>edit</span>
            </button>
            <button class="delete-btn">
              <span class="material-icons" x-on:click="deleteEntry" data-id="${record.id}">delete</span>
            </button>
          </div>
          <div class="field">
            <span>Username: ${this.escapeHTML(record.user)}</span>
            <button class="copy-btn">
              <span class="material-icons" x-on:click="copytoclipboard" data-spkdata="${record.user}" data-type="user">content_copy</span>
            </button>
          </div>
          <div class="field">
            <span>Password: ••••••••</span>
            <button class="toggle-pwd">
              <span class="material-icons" x-on:click="togglePassword" data-spkdata="${record.password}">visibility</span>
            </button>
            <button class="copy-btn">
              <span class="material-icons" x-on:click="copytoclipboard" data-spkdata="${record.password}" data-type="password">content_copy</span>
            </button>
          </div>
        </div>
        `;
      },

      // add new or update existing record with encryption of the password
      async saveEntry() {
        if (!this.validateForm()) {
          return;
        }

        try {
          const name = document.getElementById('name').value;
          const user = document.getElementById('user').value;
          const rawPassword = document.getElementById('password').value;
          const url = document.getElementById('url').value;
          const encryptedPassword = await encryptText(rawPassword);

          let data = {
            name: name,
            user: user,
            password: encryptedPassword,
            url: url,
          };

          const idValue = document.getElementById('id').value;
          if (idValue && idValue.trim() !== '') {
            data['id'] = parseInt(idValue);
          }

          const transaction = this.dbConnection.transaction("pwlist", "readwrite");
          const pwListStore = transaction.objectStore("pwlist");
          const addRequest = pwListStore.put(data);
          addRequest.onsuccess = () => {
            this.showSuccess = true;
            this.emptyForm();
            this.initAppData();
          };
          addRequest.onerror = (event) => {
            console.error("Error saving record:", event.target.error);
          };
        } catch (error) {
          console.error("Encryption error:", error);
        }
      },

      // search records by name, user, or URL
      search() {
        const searchTerm = document.getElementById('search').value.toLowerCase();
        const transaction = this.dbConnection.transaction("pwlist", "readonly");
        const pwListStore = transaction.objectStore("pwlist");
        pwListStore.getAll().onsuccess = (event) => {
          let pwList = event.target.result.reverse();
          let filteredList = pwList.filter(record =>
            record.name.toLowerCase().includes(searchTerm) ||
            record.user.toLowerCase().includes(searchTerm) ||
            (record.url && record.url.toLowerCase().includes(searchTerm))
          );
          this.spm_pwlist_html = filteredList.map(record => this.renderRecord(record)).join('');
        };
      },

      // edit record; decrypt the password before populating the form
      async editEntry(e) {
        try {
          const record = JSON.parse(e.target.getAttribute("data-spkdata"));
          document.getElementById('id').value = record.id;
          document.getElementById('name').value = record.name;
          document.getElementById('user').value = record.user;
          document.getElementById('url').value = record.url;
          const decryptedPassword = await decryptText(record.password);
          document.getElementById('password').value = decryptedPassword;
          this.showModal();
        } catch (error) {
          console.error("Error editing record:", error);
        }
      },

      // delete a record
      deleteEntry(e) {
        if (window.confirm("Are you sure?")) {
          const id = parseInt(e.target.getAttribute("data-id"));
          const transaction = this.dbConnection.transaction("pwlist", "readwrite");
          const pwListStore = transaction.objectStore("pwlist");
          const deleteRequest = pwListStore.delete(id);
          deleteRequest.onsuccess = () => {
            this.initAppData();
          };
          deleteRequest.onerror = (event) => {
            console.error("Error deleting record:", event.target.error);
          };
        }
      },

      // validate required form fields
      validateForm() {
        this.showError = false;
        this.showSuccess = false;
        const isEmpty = str => !str.trim().length;
        const name = document.getElementById('name');
        const user = document.getElementById('user');
        const password = document.getElementById('password');

        if (isEmpty(name.value) || isEmpty(user.value) || isEmpty(password.value)) {
          this.showError = true;
          return false;
        }
        return true;
      },

      // clear form fields
      emptyForm() {
        document.getElementById('id').value = '';
        document.getElementById('name').value = '';
        document.getElementById('user').value = '';
        document.getElementById('password').value = '';
        document.getElementById('url').value = '';
      },

      // show modal dialog for adding/editing
      showModal() {
        this.showError = false;
        this.showSuccess = false;
        this.isModalOpen = true;
      },

      // hide modal dialog and clear form
      hideModal() {
        this.showError = false;
        this.showSuccess = false;
        this.isModalOpen = false;
        this.emptyForm();
      },

      // copy to clipboard; decrypt if copying a password
      async copytoclipboard(e) {
        const copyButton = e.target;
        const dataType = copyButton.getAttribute("data-type");
        let text = copyButton.getAttribute("data-spkdata");
        if (dataType === "password") {
          try {
            text = await decryptText(text);
          } catch (error) {
            console.error("Error decrypting password for copy:", error);
            return;
          }
        }
        navigator.clipboard.writeText(text);
        copyButton.innerHTML = 'done';
        setTimeout(() => {
          copyButton.innerHTML = 'content_copy';
        }, 2000);
      },

      // toggle password visibility by decrypting and re-masking the display
      async togglePassword(e) {
        const toggleButton = e.target;
        const encryptedPassword = toggleButton.getAttribute("data-spkdata");
        const passwordField = toggleButton.parentElement.previousElementSibling;
        if (passwordField.textContent.includes("••••••••")) {
          try {
            const decrypted = await decryptText(encryptedPassword);
            passwordField.textContent = passwordField.textContent.replace("••••••••", decrypted);
            toggleButton.innerHTML = 'visibility_off';
          } catch (error) {
            console.error("Error decrypting password:", error);
          }
        } else {
          // Re-mask the password display (simply revert to mask)
          passwordField.textContent = passwordField.textContent.replace(passwordField.textContent, "••••••••");
          toggleButton.innerHTML = 'visibility';
        }
      },

      // helper: escape HTML characters to prevent XSS
      escapeHTML(str) {
        if (!str) return "";
        return str.replace(/[&<>'"]/g, tag => {
          const chars = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
          };
          return chars[tag] || tag;
        });
      },

      // helper: safely stringify an object for inclusion in data attributes
      safeStringify(obj) {
        return this.escapeHTML(JSON.stringify(obj));
      },
    };
  });
});

// --- Encryption Helper Functions Using Web Crypto API ---

async function getKey() {
  const password = "demoPassword"; // In production, derive this securely from user input
  const salt = new TextEncoder().encode("uniqueSalt"); // Use a unique salt per user ideally
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptText(plaintext) {
  const key = await getKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    encoded
  );
  // Combine iv and ciphertext
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  // Return as a Base64 string
  return btoa(String.fromCharCode(...combined));
}

async function decryptText(data) {
  const key = await getKey();
  const combined = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}
