import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// --- CONFIGURATION ---
const ENABLE_EMAIL_ALERTS = true; 
const SOIL_THRESHOLD = 25; 
const MY_EMAIL = "your-email@example.com"; // <--- CHANGE THIS

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Handle both JSON body and Query params for stability
  const soil = req.body?.soil || req.query?.soil;
  const temp = req.body?.temp || req.query?.temp;
  const hum = req.body?.hum || req.query?.hum;

  try {
    // 1. Fetch the last moisture reading to check for a watering event
    const { data: lastReadings } = await supabase
      .from('readings')
      .select('soil_moisture')
      .order('created_at', { ascending: false })
      .limit(1);

    const prevMoisture = lastReadings?.[0]?.soil_moisture || 0;

    // 2. If moisture jumped by 10%+, log it as a watering event
    if (soil > prevMoisture + 10) {
      await supabase.from('watering_history').insert([
        { moisture_before: prevMoisture, moisture_after: soil }
      ]);
    }

    // 3. Email Alert logic
    if (ENABLE_EMAIL_ALERTS && soil < SOIL_THRESHOLD) {
      await resend.emails.send({
        from: 'PlantMonitor <onboarding@resend.dev>',
        to: MY_EMAIL,
        subject: '🚨 Plant Alert: Water Needed!',
        html: `<p>Warning: Soil moisture is low (<strong>${soil}%</strong>). Please water your plant.</p>`
      });
    }

    // 4. Insert the new reading
    const { error } = await supabase.from('readings').insert([
      { soil_moisture: soil, temperature: temp, humidity: hum }
    ]);

    if (error) throw error;

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Handler Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
