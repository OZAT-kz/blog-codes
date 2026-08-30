// ==============================================================================
// Қазақстандық құжаттарды Document AI-ға береміз: Бухгалтердің тозағын қалай автоматтандырдық
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/document_ai_parser_kz.js
// ==============================================================================

const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
const client = new DocumentProcessorServiceClient();

async function parseKazakhInvoice(projectId, location, processorId, filePath) {
  // Указываем путь к нашему Custom Extractor процессору в Google Cloud
  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
  
  const fs = require('fs').promises;
  const imageFile = await fs.readFile(filePath);
  
  const request = {
    name,
    rawDocument: {
      content: Buffer.from(imageFile).toString('base64'),
      mimeType: 'application/pdf',
    },
  };

  // Отправляем скан на обработку в Document AI
  console.log('Отправка документа в Document AI...');
  const [result] = await client.processDocument(request);
  const document = result.document;
  
  const extractedData = { items: [] };

  // Функция для безопасного извлечения текста по якорям (Text Anchors)
  const getText = (textAnchor) => {
    if (!textAnchor || !textAnchor.textSegments || textAnchor.textSegments.length === 0) return '';
    let text = '';
    for (const segment of textAnchor.textSegments) {
      const startIndex = segment.startIndex || 0;
      const endIndex = segment.endIndex;
      text += document.text.substring(startIndex, endIndex);
    }
    return text.trim();
  };

  // Парсинг извлеченных сущностей
  for (const entity of document.entities) {
    const entityType = entity.type;
    const entityValue = entity.mentionText || getText(entity.textAnchor);

    // Собираем шапку документа
    if (entityType === 'supplier_bin') extractedData.bin = entityValue;
    if (entityType === 'total_amount') extractedData.totalAmount = entityValue;
    if (entityType === 'invoice_date') extractedData.date = entityValue;
    
    // Парсим табличную часть (Вложенные сущности / Line Items)
    if (entityType === 'line_items' && entity.properties) {
      for (const item of entity.properties) {
        let row = {};
        for (const prop of item.properties) {
          // Вытаскиваем наименование, количество, цену и сумму
          row[prop.type] = prop.mentionText || getText(prop.textAnchor);
        }
        extractedData.items.push(row);
      }
    }
  }

  console.log('Успешно распознано:', JSON.stringify(extractedData, null, 2));
  return extractedData;
}

// Пример вызова:
// parseKazakhInvoice('my-gcp-project', 'eu', 'a1b2c3d4e5f6', './nakladnaya.pdf');
