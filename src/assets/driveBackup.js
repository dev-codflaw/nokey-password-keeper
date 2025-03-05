// driveBackup.js

 
// Sign in using chrome.identity.getAuthToken
function signIn() {
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
      if (chrome.runtime.lastError || !token) {
        console.error("Failed to get auth token:", chrome.runtime.lastError && chrome.runtime.lastError.message);
        alert("Failed to get auth token: " + (chrome.runtime.lastError && chrome.runtime.lastError.message));
        return;
      }
      console.log("Signed in! Token:", token);
      // Hide sign-in button and display backup/restore controls
      document.getElementById("signInContainer").style.display = "none";
      document.getElementById("backupRestoreContainer").style.display = "block";
    });
  }


// Utility to show notifications
function showNotification(message, type = 'success') {
    const notificationArea = document.getElementById("notificationArea");
    notificationArea.textContent = message;
    notificationArea.className = type; // sets class to 'success' or 'error'
    notificationArea.classList.remove("hidden");
    // Hide after 3 seconds
    setTimeout(() => {
      notificationArea.classList.add("hidden");
    }, 3000);
  }
  
  // Show loader
  function showLoader() {
    document.getElementById("loader").classList.remove("hidden");
  }
  
  // Hide loader
  function hideLoader() {
    document.getElementById("loader").classList.add("hidden");
  }
  
   // Example modification in uploadBackup:
   async function uploadBackup(encryptedBackupData, token) {
    const metadata = {
        name: 'nokey_password_backup.json',
        mimeType: 'application/json'
      };
    
      const fileContent = new Blob([encryptedBackupData], { type: 'application/json' });
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', fileContent);

      try{
        showLoader();

        const fileName = "nokey_password_backup.json";
        // Step 1: Search for an existing file with the same name
        const searchResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'&fields=files(id)`,
          {
              method: "GET",
              headers: new Headers({
                  "Authorization": `Bearer ${token}`
              })
          }
      );

      const searchResult = await searchResponse.json();

      if (searchResult.files && searchResult.files.length > 0) {
        const existingFileId = searchResult.files[0].id;
        console.log("Existing backup found. Deleting file ID:", existingFileId);

        // Step 2: Delete the existing file
        await fetch(
            `https://www.googleapis.com/drive/v3/files/${existingFileId}`,
            {
                method: "DELETE",
                headers: new Headers({
                    "Authorization": `Bearer ${token}`
                })
            }
        );

        console.log("Previous backup deleted.");
      }
    }
      catch (error){
        console.error("File not found", error);
        showNotification("Creating new file!", 'error');
    }
    
      try {

        const response = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
          {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + token }),
            body: form
          }
        );
        const result = await response.json();
        console.log('Backup uploaded with file ID:', result.id);
        console.log('Backup successful!',);
        showNotification("Backup successful!", 'success');
        // alert("Backup successful!");
        hideLoader();

        return result.id;
      } catch (error) {
        console.error("Error uploading backup:", error);
        // alert("Backup failed!");
        showNotification("Backup failed!", 'error');

      }

  }

  
  
  async function backupData() {
    // Get the auth token first
    chrome.identity.getAuthToken({ interactive: false }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error("Failed to get auth token:", chrome.runtime.lastError);
        return;
      }
      try {
        // Replace with your actual function that gathers & encrypts your IndexedDB data
        const encryptedBackupData = await getEncryptedBackupData();
        await uploadBackup(encryptedBackupData, token);
      } catch (error) {
        console.error("Backup error:", error);
      }
    });
  }
  
  // Dummy placeholder for retrieving encrypted backup data
  async function getEncryptedBackupData() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("juasnpk", 1);
      request.onerror = (e) => reject(e.target.error);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction("pwlist", "readonly");
        const store = transaction.objectStore("pwlist");
        const getAllRequest = store.getAll();
        getAllRequest.onerror = (e) => reject(e.target.error);
        getAllRequest.onsuccess = () => {
          const data = {
            timestamp: new Date().toISOString(),
            records: getAllRequest.result
          };
          const dataString = JSON.stringify(data);
          console.log("Retrieved Backup Data:", dataString);
          resolve(dataString);
        };
      };
    });
  }



  
  async function findBackupFile(token) {
    try {
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=name='nokey_password_backup.json'&fields=files(id)`,
            {
                method: "GET",
                headers: new Headers({ "Authorization": "Bearer " + token })
            }
        );

        const result = await response.json();
        if (result.files && result.files.length > 0) {
            return result.files[0].id; // Return the first matching file ID
        }
    } catch (error) {
        console.error("Error finding backup file:", error);
    }
    return null; // No file found
}

async function downloadBackup(token) {
    const fileId = await findBackupFile(token);
    if (!fileId) {
        alert("No backup found.");
        return null;
    }

    try {
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
                method: "GET",
                headers: new Headers({ "Authorization": "Bearer " + token })
            }
        );

        return await response.text();
    } catch (error) {
        console.error("Error downloading backup:", error);
        alert("Failed to download backup.");
        return null;
    }
}

async function restoreData() {
  chrome.identity.getAuthToken({ interactive: false }, async (token) => {
      showLoader();
      if (chrome.runtime.lastError || !token) {
          console.error("Failed to get auth token:", chrome.runtime.lastError);
          alert("Authentication failed. Please try again.");
          return;
      }

      const backupData = await downloadBackup(token);
      if (!backupData) {
          hideLoader();
          return;
      }

      try {
          console.log("Raw Backup Data from Drive:", backupData);

          const parsedData = JSON.parse(backupData);
          console.log("Parsed Backup Data:", parsedData);

          // ✅ Extract the "records" array if present
          const rawData = parsedData.records ?? parsedData; 

          // ✅ Ensure it's an array
          if (!Array.isArray(rawData)) {
              throw new Error("Invalid backup format. Expected an array under 'records'.");
          }

          // ✅ Map and format the data properly for IndexedDB
          const formattedData = rawData.map((item, index) => {
              if (!item.name || !item.password) {
                  throw new Error(`Invalid backup format at index ${index}: Missing name or password.`);
              }
              return {
                  id: item.id ?? index + 1, // Keep original ID if exists, else generate one
                  name: item.name,
                  user: item.user ?? "",
                  password: item.password,
                  url: item.url ?? ""
              };
          });

          console.log("Formatted Data Ready for IndexedDB:", formattedData);

          // ✅ Store the data in IndexedDB
          await replaceIndexedDBData(formattedData);

            showNotification("Restore complete! Data updated.", 'success');
            setTimeout(() => {
              location.reload(); // Refresh after restoring
            }, 3000); // Delay of 3 seconds
      } catch (error) {
          console.error("Invalid backup format:", error);
          alert("Backup format is incorrect. Restore failed.");
      } finally {
          hideLoader();
      }
  });
}

async function loadIntoIndexedDB(data) {
    // TODO: Implement the logic to store data in IndexedDB
    console.log("Storing data in IndexedDB...", data);
}

async function replaceIndexedDBData(newData) {
  return new Promise((resolve, reject) => {
      const request = indexedDB.open("juasnpk", 1);

      request.onupgradeneeded = (event) => {
          console.log("Upgrading IndexedDB...");
          const db = event.target.result;
          if (!db.objectStoreNames.contains("pwlist")) {
              const objectStore = db.createObjectStore("pwlist", { keyPath: "id", autoIncrement: true });
              objectStore.createIndex("name", "name", { unique: false });
              console.log("Object store 'pwlist' created.");
          }
      };

      request.onsuccess = (event) => {
          console.log("IndexedDB opened successfully.");
          const db = event.target.result;
          const transaction = db.transaction("pwlist", "readwrite");
          const store = transaction.objectStore("pwlist");

          // Step 1: Clear existing data
          console.log("Clearing old data...");
          const clearRequest = store.clear();

          clearRequest.onsuccess = () => {
              console.log("Old data cleared successfully.");

              // Step 2: Insert new backup data
              newData.forEach(item => {
                  console.log("Inserting:", item);
                  store.put(item);
              });

              transaction.oncomplete = () => {
                  console.log("Restore completed.");
                  resolve();
              };

              transaction.onerror = () => {
                  console.error("Error storing backup:", transaction.error);
                  reject(transaction.error);
              };
          };

          clearRequest.onerror = () => {
              console.error("Error clearing old data:", clearRequest.error);
              reject(clearRequest.error);
          };
      };

      request.onerror = () => {
          console.error("Error opening IndexedDB:", request.error);
          reject(request.error);
      };
  });
}



  document.addEventListener("DOMContentLoaded", () => {
    const themeButtons = document.querySelectorAll(".theme-btn");
    themeButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        // Remove existing theme classes from body
        document.body.classList.remove("theme-1", "theme-2", "theme-3", "theme-4", "theme-5", "theme-6");
        // Add selected theme class from data-theme attribute
        const theme = btn.getAttribute("data-theme");
        document.body.classList.add(theme);
      });
    });
    const signInBtn = document.getElementById("signInBtn");
    if (signInBtn) {
      signInBtn.addEventListener("click", signIn);
    }
  
    const backupBtn = document.getElementById("backupBtn");
    if (backupBtn) {
      backupBtn.addEventListener("click", backupData);
    }
  
    const restoreBtn = document.getElementById("restoreBtn");
    if (restoreBtn) {
      restoreBtn.addEventListener("click", restoreData);
    }
  });
  