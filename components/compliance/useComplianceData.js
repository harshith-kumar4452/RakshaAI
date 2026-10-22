import { useEffect, useState } from "react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

// A static map of coordinates for known typical Indian cities to skip live API calls
// (Standard performant client-side fallback)
const CITIES_GEO = {
  "Mumbai": [19.0760, 72.8777],
  "Pune": [18.5204, 73.8567],
  "Nagpur": [21.1458, 79.0882],
  "Nashik": [20.0110, 73.7903],
  "Bengaluru": [12.9716, 77.5946],
  "Mysuru": [12.2958, 76.6394],
  "Hubballi": [15.3647, 75.1240],
  "Mangaluru": [12.9141, 74.8560],
  "Chennai": [13.0827, 80.2707],
  "Coimbatore": [11.0168, 76.9558],
  "Madurai": [9.9252, 78.1198],
  "Tiruchirappalli": [10.7905, 78.7047],
  "New Delhi": [28.6139, 77.2090],
  "Lucknow": [26.8467, 80.9462],
  "Kanpur": [26.4499, 80.3319],
  "Ghaziabad": [28.6692, 77.4538],
  "Agra": [27.1767, 78.0081],
  "Varanasi": [25.3176, 82.9739],
  "Ahmedabad": [23.0225, 72.5714],
  "Surat": [21.1702, 72.8311],
  "Vadodara": [22.3072, 73.1812],
  "Rajkot": [22.3039, 70.8022],
  "Kolkata": [22.5726, 88.3639],
  "Howrah": [22.5958, 88.3110],
  "Siliguri": [26.7271, 88.3953],
  "Jaipur": [26.9124, 75.7873],
  "Jodhpur": [26.2389, 73.0243],
  "Udaipur": [24.5854, 73.7125],
  "Kota": [25.2138, 75.8648],
  "Thiruvananthapuram": [8.5241, 76.9366],
  "Kochi": [9.9312, 76.2673],
  "Kozhikode": [11.2588, 75.7804],
  "Bhopal": [23.2599, 77.4126],
  "Indore": [22.7196, 75.8577],
  "Gwalior": [26.2124, 78.1772],
  "Patna": [25.5941, 85.1376],
  "Gaya": [24.7914, 85.0002],
  "Bhubaneswar": [20.2961, 85.8245],
  "Cuttack": [20.4625, 85.8830],
  "Ludhiana": [30.9010, 75.8573],
  "Amritsar": [31.6340, 74.8723],
  "Guwahati": [26.1445, 91.7362],
  "Dibrugarh": [27.4728, 94.9120]
}

async function fetchCityCoordinates(city) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city + ", India")}`)
    const data = await res.json()
    if (data && data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
    }
  } catch (err) {
    console.error(`Failed to fetch coordinates for ${city}:`, err)
  }
  return [20.5937, 78.9629] // Fallback central India
}

export function useComplianceData() {
  const [dbData, setDbData] = useState(null)
  
  useEffect(() => {
    async function fetchFromSupabase() {
      try {
        const sb = createSupabaseBrowserClient()
        // Pull down 1000 generated profiles
        const { data: persons, error } = await sb.from("mock_persons").select("*").limit(1000)
        
        if (error) {
          console.error("Supabase Error:", error)
          return
        }
        if (persons && persons.length > 0) {
          await processData(persons)
        }
      } catch (err) {
        console.error("Compliance connection failed", err)
      }
    }

    async function processData(persons) {
      // 1. Process Map Cases by City
      const caseCountsByCity = {}
      persons.forEach(p => {
        if (!p.has_criminal_record) return
        const city = p.home_city
        if (!caseCountsByCity[city]) {
          caseCountsByCity[city] = { count: 0, crimeTypes: [] }
        }
        caseCountsByCity[city].count += 1
        caseCountsByCity[city].crimeTypes.push(p.criminal_record_type)
      })

      const mapCases = []
      const uniqueCities = Object.keys(caseCountsByCity)

      for (const city of uniqueCities) {
        const stats = caseCountsByCity[city]
        const topType = stats.crimeTypes[0] || "Misc Offense"
        const count = stats.count
        const severity = count > 15 ? "high" : count > 5 ? "medium" : "low"
        
        let lat, lng
        if (CITIES_GEO[city]) {
          [lat, lng] = CITIES_GEO[city]
        } else {
          // Dynamic OpenSource API fallback!
          console.log(`Dynamically geocoding ${city} via Nominatim...`)
          const coords = await fetchCityCoordinates(city)
          lat = coords[0]
          lng = coords[1]
          // Save back to local cache to avoid repeating live calls
          CITIES_GEO[city] = coords 
          // Add a respectful 1-second delay for Nominatim strict policy
          await new Promise(r => setTimeout(r, 1000))
        }
        
        mapCases.push({ lat, lng, city, count, type: topType, severity })
      }

      // 2. Department Risks (Heatmap)
      const depts = {}
      persons.forEach(p => {
        const dept = p.department
        if (!depts[dept]) depts[dept] = { reports: 0 }
        if (p.has_criminal_record) depts[dept].reports += 1
      })
      
      const heatmapDepts = Object.keys(depts).map(d => {
        const rep = depts[d].reports
        const risk = rep > 20 ? "High" : rep === 0 ? "Desert" : rep > 5 ? "Medium" : "Low"
        const trend = rep > 15 ? "+12%" : rep === 0 ? "N/A" : "-2%"
        return { name: d, reports: rep, risk, trend }
      }).sort((a,b) => b.reports - a.reports)

      // 3. SLAs
      const criminals = persons.filter(p => p.has_criminal_record).slice(0, 10)
      const slaTracker = criminals.map((c, idx) => {
        const daysInt = Math.floor(Math.random() * 80) + (idx < 3 ? 90 : 10) // Force some breaches
        const status = daysInt > 90 ? "breach" : daysInt > 75 ? "risk" : "ok"
        const daysStr = daysInt > 90 ? `+${daysInt - 90} days` : `${90 - daysInt} days left`
        
        return {
          id: `JUST-${String(c.aadhar_id).substring(0,4)}`,
          cat: c.criminal_record_type,
          location: c.home_city,
          investigator: "Automated System",
          status,
          days: daysStr
        }
      })

      // 4. POSH Reports Stats
      const totalCriminals = persons.filter(p => p.has_criminal_record).length
      
      const poshStats = [
        { label: "Total POSH complaints received", count: totalCriminals },
        { label: "Total POSH complaints disposed of", count: Math.floor(totalCriminals * 0.85) },
        { label: "Total POSH complaints pending > 90 days", count: slaTracker.filter(s => s.status === 'breach').length },
        { label: "Workshops & awareness programs conducted", count: 18 },
        { label: "Nature of action taken", count: 12 },
      ]

      const poshBreakdown = [
        { type: "Written Apology", count: Math.floor(totalCriminals * 0.3) },
        { type: "Warning Issued", count: Math.floor(totalCriminals * 0.25) },
        { type: "Reprimand & Probation", count: Math.floor(totalCriminals * 0.15) },
        { type: "Withholding Promotion", count: Math.floor(totalCriminals * 0.1) },
        { type: "Termination", count: Math.floor(totalCriminals * 0.05) },
      ]

      // 5. Audit Logs (Recent Criminal Records as System Logs)
      const auditLogs = persons.filter(p => p.has_criminal_record).slice(0, 10).map((p, i) => {
        return {
          timestamp: `2026-03-${24 - Math.floor(i/2)} 1${Math.floor(Math.random()*8)}:${Math.floor(Math.random()*50)}:11`,
          user: "Justra NYAYA (Automated Analytics)",
          action: `Generated intelligence flag regarding ${p.criminal_record_type}`,
          case: `JUST-${String(p.aadhar_id).substring(0,4)}`,
          type: "ai_intelligence_scan"
        }
      })

      setDbData({
        totalCases: totalCriminals,
        mapCases,
        heatmapDepts,
        slaTracker,
        poshStats,
        poshBreakdown,
        auditLogs,
        rawPersons: persons
      })
    }
    
    fetchFromSupabase()
  }, [])

  return dbData
}
