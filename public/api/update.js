import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// --- CONFIGURATION SWITCH ---
const ENABLE_EMAIL_ALERTS = true; 
const SOIL_THRESHOLD = 25; // Send email if moisture is below this %

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const resend = new Resend(process.env.RESEND_API_KEY);
  
  const { soil, temp, hum } = req.body;

  try {
    // 1. Get the previous reading for watering detection
    const { data: lastReadings } = await supabase
      .from('readings')
      .select('soil_moisture')
      .order('created_at', { ascending: false })
      .limit(1);

    const prevMoisture = lastReadings?.[0]?.soil_moisture || 0;

    // 2. Watering Event Detection
    if (soil > prevMoisture + 10) {
      await supabase.from('watering_history').insert([{ 
        moisture_before: prevMoisture, 
        moisture_after: soil 
      }]);
    }

    // 3. EMAIL ALERT LOGIC (24/7 Check)
    if (ENABLE_EMAIL_ALERTS && soil < SOIL_THRESHOLD) {
      // Note: In a real-world app, you'd check a "last_email_sent" timestamp 
      // in your DB here to avoid spamming.
      await resend.emails.send({
        from: 'PlantMonitor <onboarding@resend.dev>',
        to: 'stevemathew1306@gmail.com', // <--- PUT YOUR EMAIL HERE
        subject: '🚨 Plant Alert: Low Water!',
        html: `<p>Your plant is thirsty! Current moisture is <strong>${soil}%</strong>.</p>`
      });
    }

    // 4. Final Insert
    const { error } = await supabase.from('readings').insert([{ 
      soil_moisture: soil, 
      temperature: temp, 
      humidity: hum 
    }]);

    if (error) throw error;
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
