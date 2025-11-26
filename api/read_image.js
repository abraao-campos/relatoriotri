// api/read_image.js
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
});

// Helper para converter Base64 para objeto de imagem do Gemini
function base64ToGenerativePart(base64Data, mimeType) {
    return {
        inlineData: {
            data: base64Data,
            mimeType,
        },
    };
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: "Método não permitido. Use POST." });
    }

    try {
        // Verifica a chave da API
        if (!process.env.GEMINI_API_KEY) {
             throw new Error("Variável de ambiente GEMINI_API_KEY não está definida. Verifique a configuração do seu host.");
        }
        
        // 1. Extração de Dados do Request
        const { base64Image, numQuestoes, numAlternativas } = req.body;
        
        if (!base64Image || !numQuestoes || !numAlternativas) {
             throw new Error("Dados incompletos: imagem, número de questões ou alternativas ausentes.");
        }

        const mimeType = 'image/jpeg'; // Assumimos JPEG
        const imagePart = base64ToGenerativePart(base64Image, mimeType);
        
        const alternativasString = ['A', 'B', 'C', 'D', 'E'].slice(0, numAlternativas).join(', ');
        
        // Prompt de Leitura para o Gemini
        const prompt = `Você é um leitor de gabaritos altamente preciso. 
Sua tarefa é analisar a imagem do gabarito fornecida e extrair a resposta marcada para cada questão.

**Regras de Leitura:**
1.  O gabarito tem ${numQuestoes} questões.
2.  Cada questão tem ${numAlternativas} alternativas (${alternativasString}).
3.  Se uma questão tiver **uma** marcação clara, retorne a letra correspondente.
4.  Se uma questão for deixada **em branco**, retorne 'B'.
5.  Se uma questão tiver **múltiplas** marcações (rasura), retorne 'X'.

**Instrução de Saída:**
Sua saída deve ser um objeto JSON simples. A chave deve ser o número da questão (ex: "Q1") e o valor deve ser a resposta lida (A, B, C, D, E, B, ou X).

**EXEMPLO DE FORMATO DE SAÍDA (Obrigatório):**
\`\`\`json
{
  "Q1": "A",
  "Q2": "X",
  "Q3": "B",
  "Q${numQuestoes}": "C"
}
\`\`\`

Não inclua nenhum texto de introdução, explicação ou código extra. Apenas o bloco JSON solicitado.`;

        // 3. Chamada à API do Gemini Vision
        const contents = [imagePart, { text: prompt }];

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // Modelo de visão rápida
            contents: contents,
            config: {
                responseMimeType: 'text/plain', 
                temperature: 0.0, // Precisão máxima
            }
        });

        // 4. Extração e Validação do JSON
        const fullText = response.text.trim();
        const jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/);

        if (!jsonMatch) {
             throw new Error(`O Gemini não retornou o bloco \`\`\`json\`\`\` esperado. Resposta completa: ${fullText}`);
        }
        
        const jsonString = jsonMatch[1].trim();
        const respostasLidas = JSON.parse(jsonString);

        // 5. Montagem da Resposta Final
        return res.status(200).json({
            success: true,
            respostas: respostasLidas, 
            error: null 
        });

    } catch (e) {
        console.error(`ERRO CRÍTICO NO HANDLER:`, e.message);
        return res.status(500).json({ 
            success: false, 
            error: `Falha no processamento por IA: ${e.message}`
        });
    }
};
