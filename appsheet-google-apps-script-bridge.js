// ==============================================================================
// Google Apps Script Bridge: AppSheet Camera Scan to Cloud Run AI Webhook
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/appsheet-google-apps-script-bridge.js
// ==============================================================================

/**
 * Google Apps Script Webhook Bridge для мгновенной синхронизации AppSheet с Gemini Cloud Run
 * Источник: OZAT Engineering Blog (https://ozat.kz)
 */
function onAppSheetScanTrigger(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Inventory_Log");
  
  // Получение последнего фото из Google Drive, загруженного через камеру смартфона в AppSheet
  var rowData = e.values; // [Timestamp, ContainerId, ImageDriveUrl, Auditor]
  var imageDriveUrl = rowData[2];
  var containerId = rowData[1];
  var auditor = rowData[3];
  
  if (!imageDriveUrl) return;
  
  var fileId = extractDriveFileId(imageDriveUrl);
  var imageBlob = DriveApp.getFileById(fileId).getBlob();
  var base64Data = Utilities.base64Encode(imageBlob.getBytes());
  var mimeType = imageBlob.getContentType();
  
  var cloudRunEndpoint = "https://inventory-auditor-gemini-qp6wbxw42h-as.a.run.app/api/v1/inventory/audit-photo";
  
  var payload = {
    imageBase64: base64Data,
    mimeType: mimeType,
    containerId: containerId,
    operatorEmail: auditor
  };
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(cloudRunEndpoint, options);
    var result = JSON.parse(response.getContentText());
    
    if (result.status === "success" && result.items && result.items.length > 0) {
      var itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Detected_Items");
      
      result.items.forEach(function(item) {
        itemsSheet.appendRow([
          new Date(),
          containerId,
          item.oemArticle || "N/A",
          item.partNameRu,
          item.carBrandModel || "Универсал",
          item.quantity,
          item.condition,
          result.notes || "",
          item.confidenceScore
        ]);
      });
      
      Logger.log("Успешно добавлено " + result.items.length + " позиций для контейнера " + containerId);
    }
  } catch (err) {
    Logger.log("Ошибка вызова Cloud Run: " + err.toString());
  }
}

function extractDriveFileId(url) {
  var id = "";
  var parts = url.split("id=");
  if (parts.length > 1) {
    id = parts[1].split("&")[0];
  } else {
    var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) id = match[1];
  }
  return id;
}
