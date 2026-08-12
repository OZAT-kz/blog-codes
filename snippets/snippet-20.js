// ==============================================================================
// Provided by OZAT (https://github.com/OZAT-kz)
// ==============================================================================

// Лидті скорингтеуге арналған Cloud Function фрагменті
const { aiplatform } = require(\'@google-cloud/aiplatform\');
const { BigQuery } = require(\'@google-cloud/bigquery\');

const bq = new BigQuery();
const client = new aiplatform.v1.PredictionServiceClient({
  apiEndpoint: \'europe-west4-aiplatform.googleapis.com\',
});

exports.scoreLead = async (req, res) => {
  const { clientId, phone, crmLeadId } = req.body;

  // 1. Юзердің жаңа фичалары үшін BigQuery-ге барамыз
  const query = `SELECT * FROM \`project.dbt_prod.user_features\` WHERE client_id = @clientId`;
  const [rows] = await bq.query({ query, params: { clientId } });
  
  if (!rows || rows.length === 0) return res.status(200).send(\'No data\');
  const features = rows[0];

  // 2. Фичаларды Vertex AI-ге жібереміз
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

  // 3. Ықтималдықты аламыз (score 0-ден 1-ге дейін)
  const predictionResult = response.predictions[0].structValue.fields;
  const score = predictionResult.classes.listValue.values[0].numberValue;

  // 4. Нәтижені кері CRM-ге (amoCRM) жібереміз
  await updateCrmLead(crmLeadId, { 
    \'score\': score, 
    \'priority\': score > 0.7 ? \'HIGH\' : \'LOW\' 
  });

  res.status(200).send({ score });
};
