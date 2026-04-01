import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RowData {
  rowIndex: number;
  data: Record<string, unknown>;
}

interface EditRequest {
  command: string;
  rows: RowData[];
  fields: { key: string; label: string; type: string }[];
}

interface EditedRow {
  rowIndex: number;
  changes: Record<string, unknown>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { command, rows, fields } = (await req.json()) as EditRequest;
    
    if (!command || !rows || !fields) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: command, rows, fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const AI_API_KEY = Deno.env.get("AI_API_KEY");
    if (!AI_API_KEY) {
      console.error("AI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the system prompt
    const systemPrompt = `You are a data transformation assistant. You help users edit tabular data by applying text transformations and bulk corrections.

The user has a dataset with the following fields:
${fields.map(f => `- "${f.key}" (${f.label}): type ${f.type}`).join("\n")}

You will receive:
1. A natural language command describing what changes to make
2. The current rows of data

Your task is to return ONLY a JSON array of edits. Each edit should be an object with:
- "rowIndex": the row number to edit
- "changes": an object with field keys and their new values

Only include rows that need changes. If no changes are needed, return an empty array.

Examples:
- Command: "capitalize all titles"
  Response: [{"rowIndex": 0, "changes": {"title": "MONA LISA"}}, {"rowIndex": 1, "changes": {"title": "STARRY NIGHT"}}]

- Command: "fix currency to USD for rows with amounts over 1000"
  Response: [{"rowIndex": 2, "changes": {"valueCurrency": "USD"}}, {"rowIndex": 5, "changes": {"valueCurrency": "USD"}}]

- Command: "trim whitespace from artist names"
  Response: [{"rowIndex": 1, "changes": {"artist": "Pablo Picasso"}}]

IMPORTANT:
- Return ONLY valid JSON, no markdown, no explanations
- Only include rows that actually need changes
- Preserve data types (numbers as numbers, strings as strings)
- If the command is unclear or impossible, return: {"error": "explanation"}`;

    // Prepare the data for the prompt (limit to avoid token overflow)
    const maxRows = 100;
    const truncatedRows = rows.slice(0, maxRows);
    const dataPrompt = JSON.stringify(truncatedRows, null, 2);

    const userPrompt = `Command: "${command}"

Current data (${rows.length} rows${rows.length > maxRows ? `, showing first ${maxRows}` : ""}):
${dataPrompt}

Return the JSON array of edits:`;

    console.log(`Processing AI edit command: "${command}" for ${rows.length} rows`);

    const AI_GATEWAY_URL = Deno.env.get("AI_GATEWAY_URL") || "https://api.openai.com/v1/chat/completions";

    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1, // Low temperature for consistent results
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in AI response:", aiResponse);
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("AI response content:", content);

    // Parse the JSON response
    let edits: EditedRow[] | { error: string };
    try {
      // Clean up potential markdown formatting
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.slice(7);
      }
      if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith("```")) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      cleanedContent = cleanedContent.trim();

      edits = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError, content);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if AI returned an error
    if (!Array.isArray(edits) && edits.error) {
      return new Response(
        JSON.stringify({ error: edits.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`AI returned ${Array.isArray(edits) ? edits.length : 0} edits`);

    return new Response(
      JSON.stringify({ edits: edits, rowsProcessed: rows.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
