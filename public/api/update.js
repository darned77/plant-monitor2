import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const { soil, temp, hum } = req.body;

  try {
    // 1. Get the very last reading to compare moisture
    const { data: lastReadings } = await supabase
      .from('readings')
      .select('soil_moisture')
      .order('created_at', { ascending: false })
      .limit(1);

    const prevMoisture = lastReadings?.[0]?.soil_moisture || 0;

    // 2. If moisture jumped by 10%+, log it as a watering event
    if (soil > prevMoisture + 10) {
      await supabase
        .from('watering_history')
        .insert([{ 
          moisture_before: prevMoisture, 
          moisture_after: soil 
        }]);
    }

    // 3. Insert the current reading
    const { error } = await supabase
      .from('readings')
      .insert([{ 
        soil_moisture: soil, 
        temperature: temp, 
        humidity: hum 
      }]);

    if (error) throw error;
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Server Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
