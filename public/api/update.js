import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// --- CONFIGURATION ---
const ENABLE_EMAIL_ALERTS = true; 
const SOIL_THRESHOLD = 25; 
const MY_EMAIL = "stevemathew2006@gmail.com"; 

export default async function handler(req, res) {
  console.log("--- DEBUG START ---");
  
  // 1. FORGIVING DATA EXTRACTION
  // This checks body, query, and common Case-Sensitive variations
  let rawSoil = req.body?.soil ?? req.query?.soil ?? req.body?.Soil;
  let rawTemp = req.body?.temp ?? req.query?.temp ?? req.body?.Temp;
  let rawHum = req.body?.hum ?? req.query?.hum ?? req.body?.Hum;

  console.log("Raw Received Data:", { rawSoil, rawTemp, rawHum });

  // 2. DATA CLEANING (Removes spaces, units, or non-numeric garbage)
  const cleanNum = (val) => {
    if (val === undefined || val === null) return NaN;
    // Strip everything except numbers, dots, and minus signs
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned);
  };

  const soil = cleanNum(rawSoil);
  const temp = cleanNum(rawTemp);
  const hum = cleanNum(rawHum);

  console.log(`Cleaned Values -> Soil: ${soil}, Temp: ${temp}, Hum: ${hum}`);

  // 3. VALIDATION
  if (isNaN(soil)) {
    console.error("CRITICAL: Soil is still NaN. Payload was:", JSON.stringify(req.body));
    return res.status(400).json({ 
        error: "Soil value missing or invalid", 
        debug_received: req.body 
    });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    // 4. FETCH PREVIOUS MOISTURE
    const { data: lastReadings } = await supabase
      .from('readings')
      .select('soil_moisture')
      .order('created_at', { ascending: false })
      .limit(1);

    const prevMoisture = lastReadings?.[0]?.soil_moisture || 0;

    // 5. WATERING DETECTION
    if (soil > prevMoisture + 10) {
      console.log("Watering detected!");
      await supabase.from('watering_history').insert([
        { moisture_before: prevMoisture, moisture_after: soil }
      ]);
    }

    // 6. EMAIL LOGIC (Wrapped in try/catch so it doesn't break the DB insert)
    if (ENABLE_EMAIL_ALERTS && soil < SOIL_THRESHOLD) {
      try {
        console.log("Sending alert email...");
        await resend.emails.send({
          from: 'PlantMonitor <onboarding@resend.dev>',
          to: MY_EMAIL,
          subject: '🚨 Plant Alert: Water Needed!',
          html: `<p>Warning: Soil moisture is low (<strong>${soil}%</strong>).</p>`
        });
      } catch (mailErr) {
        console.error("Mail Service Error (Skipped):", mailErr.message);
      }
    }

    // 7. INSERT DATA
    const { error: insertError } = await supabase.from('readings').insert([
      { soil_moisture: soil, temperature: temp, humidity: hum }
    ]);

    if (insertError) throw insertError;

    console.log("--- SUCCESS ---");
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("HANDLER CRASHED:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
