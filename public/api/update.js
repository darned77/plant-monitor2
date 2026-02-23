import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Add this line to check your keys in the Vercel logs (it will print 'true' or 'false')
  console.log("Keys loaded:", !!process.env.SUPABASE_URL, !!process.env.SUPABASE_KEY);
  console.log("Body received:", req.body);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  
  const { soil, temp, hum } = req.body;

  const { data, error } = await supabase
    .from('readings')
    .insert([
      { 
        soil_moisture: soil,
        temperature: temp,
        humidity: hum
      }
    ]);

  if (error) {
    console.error("Supabase Error:", error.message);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ success: true });
}
