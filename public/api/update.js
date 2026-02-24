import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// --- CONFIGURATION ---
const ENABLE_EMAIL_ALERTS = true; 
const SOIL_THRESHOLD = 25; 
const MY_EMAIL = "stevemathew2006@gmail.com"; 

export default async function handler(req, res) {
  // 1. LOG INCOMING REQUEST
  console.log("--- DEBUG START ---");
  console.log("Method:", req.method);
  console.log("Body:", JSON.stringify(req.body));
  console.log("Query:", JSON.stringify(req.query));

  // 2. CHECK ENVIRONMENT VARIABLES
  const envCheck = {
    url: !!process.env.SUPABASE_URL,
    key: !!process.env.SUPABASE_KEY,
    resend: !!process.env.RESEND_API_KEY
  };
  console.log("Env Vars Status:", envCheck);

  if (!envCheck.url || !envCheck.key) {
    console.error("CRITICAL: Supabase keys are missing in Vercel settings!");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const resend = new Resend(process.env.RESEND_API_KEY);

  // 3. EXTRACT AND VALIDATE DATA
  const soil = parseFloat(req.body?.soil || req.query?.soil);
  const temp = parseFloat(req.body?.temp || req.query?.temp);
  const hum = parseFloat(req.body?.hum || req.query?.hum);

  console.log(`Parsed Values - Soil: ${soil}, Temp: ${temp}, Hum: ${hum}`);

  if (isNaN(soil)) {
    console.error("ERROR: Soil value is not a valid number.");
    return res.status(400).json({ error: "Invalid data received" });
  }

  try {
    // 4. SUPABASE READ CHECK
    console.log("Fetching last reading...");
    const { data: lastReadings, error: readError } = await supabase
      .from('readings')
      .select('soil_moisture')
      .order('created_at', { ascending: false })
      .limit(1);

    if (readError) {
        console.error("Supabase Read Error:", readError.message);
        throw readError;
    }

    const prevMoisture = lastReadings?.[0]?.soil_moisture || 0;
    console.log("Previous Moisture was:", prevMoisture);

    // 5. WATERING HISTORY LOGIC
    if (soil > prevMoisture + 10) {
      console.log("Watering detected! Logging to history...");
      await supabase.from('watering_history').insert([
        { moisture_before: prevMoisture, moisture_after: soil }
      ]);
    }

    // 6. EMAIL ALERT LOGIC
    if (ENABLE_EMAIL_ALERTS && soil < SOIL_THRESHOLD) {
      console.log("Soil below threshold. Attempting to send email via Resend...");
      if (!process.env.RESEND_API_KEY) {
          console.error("Email skipped: RESEND_API_KEY is missing.");
      } else {
          const emailResult = await resend.emails.send({
            from: 'PlantMonitor <onboarding@resend.dev>',
            to: MY_EMAIL,
            subject: '🚨 Plant Alert: Water Needed!',
            html: `<p>Warning: Soil moisture is low (<strong>${soil}%</strong>).</p>`
          });
          console.log("Resend Response:", JSON.stringify(emailResult));
      }
    }

    // 7. FINAL INSERT
    console.log("Inserting new reading into Supabase...");
    const { error: insertError } = await supabase.from('readings').insert([
      { soil_moisture: soil, temperature: temp, humidity: hum }
    ]);

    if (insertError) {
        console.error("Supabase Insert Error:", insertError.message);
        throw insertError;
    }

    console.log("--- DEBUG SUCCESS ---");
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("HANDLER CRASHED:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
