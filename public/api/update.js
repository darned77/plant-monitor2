import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// --- CONFIGURATION ---
const ENABLE_EMAIL_ALERTS = true; 
const SOIL_THRESHOLD = 25; 
const MY_EMAIL = "stevemathew2006@gmail.com"; 
const ALERT_COOLDOWN_MINUTES = 60; // <--- Set to 1 hour

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const resend = new Resend(process.env.RESEND_API_KEY);

  // 1. Data Extraction
  let rawSoil = req.body?.soil ?? req.query?.soil ?? req.body?.Soil;
  let rawTemp = req.body?.temp ?? req.query?.temp ?? req.body?.Temp;
  let rawHum = req.body?.hum ?? req.query?.hum ?? req.body?.Hum;

  const cleanNum = (val) => {
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned);
  };

  const soil = cleanNum(rawSoil);
  const temp = cleanNum(rawTemp);
  const hum = cleanNum(rawHum);

  if (isNaN(soil)) return res.status(400).json({ error: "Invalid data" });

  try {
    // 2. Fetch last readings to check for Watering and Email Cooldown
    const { data: lastReadings } = await supabase
      .from('readings')
      .select('soil_moisture, created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    const latestEntry = lastReadings?.[0];
    const prevMoisture = latestEntry?.soil_moisture || 0;

    // 3. Watering Detection
    if (soil > prevMoisture + 10) {
      await supabase.from('watering_history').insert([
        { moisture_before: prevMoisture, moisture_after: soil }
      ]);
    }

    // 4. EMAIL ALERT WITH COOLDOWN
    if (ENABLE_EMAIL_ALERTS && soil < SOIL_THRESHOLD) {
      let shouldSend = true;

      if (latestEntry) {
        const lastAlertTime = new Date(latestEntry.created_at);
        const now = new Date();
        const minutesSinceLast = (now - lastAlertTime) / (1000 * 60);

        // If the last reading was also "Dry" and was sent recently, skip email
        if (latestEntry.soil_moisture < SOIL_THRESHOLD && minutesSinceLast < ALERT_COOLDOWN_MINUTES) {
          console.log(`Skipping email. Last alert was only ${Math.round(minutesSinceLast)} mins ago.`);
          shouldSend = false;
        }
      }

      if (shouldSend) {
        try {
          await resend.emails.send({
            from: 'PlantMonitor <onboarding@resend.dev>',
            to: MY_EMAIL,
            subject: '🚨 Plant Alert: Water Needed!',
            html: `<p>Soil moisture is low (<strong>${soil}%</strong>). This is your hourly reminder.</p>`
          });
          console.log("Alert email sent.");
        } catch (mailErr) {
          console.error("Mail failed:", mailErr.message);
        }
      }
    }

    // 5. Insert current reading
    await supabase.from('readings').insert([
      { soil_moisture: soil, temperature: temp, humidity: hum }
    ]);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Global Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
