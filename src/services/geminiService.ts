import { GoogleGenAI, Type } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY;

export interface DailyStats {
  date: string; // YYYY-MM-DD
  profit: number;
  investment: number;
  roi: number;
}

export async function analyzeTradingData(files: { data: string; mimeType: string; name: string }[]): Promise<DailyStats[]> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const prompt = `
    Analyze the provided trading data (could be screenshots of profit/loss tables, order history, or CSV content).
    Extract the daily profit/loss and the total investment/capital used for each date found.
    
    If multiple trades exist for the same date, aggregate them.
    If investment is not explicitly stated, try to infer it from order values or capital used. 
    If you cannot find investment, return 0 for it.
    
    Return the data as a JSON array of objects with:
    - date: "YYYY-MM-DD"
    - profit: number (positive for profit, negative for loss)
    - investment: number (total capital used for those trades)
    - roi: number (percentage, e.g., 4.67)
    
    Calculate ROI as (profit / investment) * 100 if investment > 0.
  `;

  const parts = files.map(file => {
    if (file.mimeType.startsWith('image/')) {
      return {
        inlineData: {
          data: file.data.split(',')[1],
          mimeType: file.mimeType
        }
      };
    } else {
      // Assume text/csv or similar
      return { text: `File Name: ${file.name}\nContent:\n${file.data}` };
    }
  });

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [{ parts: [...parts, { text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            profit: { type: Type.NUMBER },
            investment: { type: Type.NUMBER },
            roi: { type: Type.NUMBER }
          },
          required: ["date", "profit", "investment", "roi"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}

export async function processBotQuery(currentData: DailyStats[], query: string): Promise<DailyStats[]> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const prompt = `
    You are the ProfitPulse Bot, an expert trading data analyst.
    Current Portfolio Data: ${JSON.stringify(currentData)}
    
    User Query: "${query}"
    
    Task:
    1. Analyze the user's request to modify, update, delete, or inquire about the existing data.
    2. If the request involves a calculation (e.g., "reduce profit by 10% for taxes" or "subtract 500 from each day"), apply it to the data.
    3. Return the ENTIRE updated JSON array of DailyStats objects.
    4. Ensure the "date" remains in "YYYY-MM-DD" format.
    5. Re-calculate ROI if profit or investment changes: ROI = (profit / investment) * 100.
    
    Return ONLY the valid JSON array.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            profit: { type: Type.NUMBER },
            investment: { type: Type.NUMBER },
            roi: { type: Type.NUMBER }
          },
          required: ["date", "profit", "investment", "roi"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse Bot response", e);
    return currentData;
  }
}
