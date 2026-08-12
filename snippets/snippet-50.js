// ==============================================================================
// Provided by OZAT (https://github.com/OZAT-kz)
// ==============================================================================

// Фрагмент Cloud Function для скоринга лида
const { aiplatform } = require(\'@google-cloud/aiplatform\');
const { BigQuery } = require(\'@google-cloud/bigquery\');

const bq = new BigQuery();
const client = new aiplatform.v1.PredictionServiceClient({
  apiEndpoint: \'europe-west4-aiplatform.googleapis.com\',
});

exports.scoreLead = async (req, res) => {
  const { clientId, phone, crmLeadId } = req.body;

  // 1. Идем в BigQuery за свежими фичами юзера
  const query = `SELECT * FROM \`project.dbt_prod.user_features\` WHERE client_id = @clientId`;
  const [rows] = await bq.query({ query, params: { clientId } });
  
  if (!rows || rows.length === 0) return res.status(200).send(\'No data\');
  const features = rows[0];

  // 2. Отправляем фичи в Vertex AI
  const endpoint = `projects/PROJECT_ID/locations/europe-west4/endpoints/ENDPOINT_ID`;
  const instance = {
    structValue: {
      fields: {
        layout_views: { numberValue: features.layout_views },
        calculator_uses: { numberValue: features.calculator_uses },
        session_duration: { numberValue: features.session_duration_seconds },
        phone_brand: { stringValue: features.phone_brand }
        // ...
      }
    }
  };

  const [response] = await client.predict({
    endpoint,
    instances: [instance],
  });

  // 3. Получаем вероятность (score от 0 до 1)
  const predictionResult = response.predictions[0].structValue.fields;
  const score = predictionResult.classes.listValue.values[0].numberValue;

  // 4. Отправляем результат обратно в CRM (amoCRM)
  await updateCrmLead(crmLeadId, { 
    \'score\': score, 
    \'priority\': score > 0.7 ? \'HIGH\' : \'LOW\' 
  });

  res.status(200).send({ score });
};
