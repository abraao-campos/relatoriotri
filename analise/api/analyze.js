// api/analyze.js - Código Final com Robustez de Extração JSON

const { GoogleGenAI } = require('@google/genai');
// Força a utilização da variável de ambiente CHAVE
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
}); 
// --- Função Helper: Chunking ---
function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// --- Handler Principal (Exportação) ---
module.exports = async (req, res) => {
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: "Método não permitido. Use POST." });
    }

    try {
        // VERIFICAÇÃO ADICIONAL: Verifica se a chave foi carregada antes de qualquer chamada API
        if (!process.env.GEMINI_API_KEY) {
             throw new Error("Variável de ambiente GEMINI_API_KEY não está definida. Verifique a configuração do seu host.");
        }
        
        // --- 1. Extração de Dados ---
        const { resultadosContent, resultadosFilename } = req.body;
        const alunosOriginal = JSON.parse(resultadosContent);

        if (alunosOriginal.length === 0) {
            return res.status(400).json({ success: false, error: "O arquivo de resultados não contém dados após a conversão." });
        }

        const gabaritoOficial = alunosOriginal[0];
        const alunosParaCorrigir = alunosOriginal.slice(1);
        const totalQuestoes = Object.keys(gabaritoOficial).length - 1; 

        if (alunosParaCorrigir.length === 0) {
            return res.status(400).json({ success: false, error: "O arquivo não contém marcações de alunos para corrigir." });
        }

        // --- 2. Chunking e Processamento do Gemini ---
        // Usamos 35 como um bom meio termo, mas o processamento PARALELO é o fator mais importante.
        const alunoChunks = chunkArray(alunosParaCorrigir, 35); 
        
        // ----------------------------------------------------------------------
        // NOVO: Processamento Paralelo usando Promise.all() (Resolve 504 Timeout)
        // ----------------------------------------------------------------------
        const analysisPromises = alunoChunks.map((chunk, i) => {
            const chunkData = [gabaritoOficial, ...chunk];
            const chunkJsonString = JSON.stringify(chunkData, null, 2);
            
            let prompt;
            if (i === 0) {
                // Prompt completo para o primeiro lote (com análise geral)
                prompt = `Você é um Analista de Desempenho Escolar.
Sua tarefa é corrigir e analisar o desempenho dos alunos com base no Gabarito Oficial fornecido na primeira linha do JSON.
**Instruções de Saída:**
                1. **Correção Detalhada (Bloco JSON):** Gere um Array JSON chamado 'relatorio_alunos' para CADA ALUNO corrigido neste bloco.
O Array deve conter as chaves: "Aluno", "Acertos", "Erros", "Percentual_Acerto" (formatado com 2 casas decimais e vírgula como separador).
O campo "Total_Questoes" deve ser **${totalQuestoes}**.
                2. **Métricas Chave (Próxima Seção):** Calcule e liste a Média, a Maior e a Menor Pontuação de Acertos APENAS para os alunos neste lote.
3. **Observações Gerais (Bloco TEXT):** APENAS neste lote (Chunk 0), forneça uma análise qualitativa detalhada de 300 palavras sobre o desempenho geral da turma, identificando pontos fortes e fracos, e sugerindo intervenções pedagógicas.
Siga **EXATAMENTE** este formato para a saída: \`\`\`json [...] \`\`\` **Média de Acertos:** [...] **Maior Pontuação:** [...] **Menor Pontuação:** [...] \`\`\`text Observações Gerais: [...] \`\`\`
                
                **Dados a Analisar (Gabarito + Alunos):** ${chunkJsonString}`;
            } else {
                // Prompt simplificado (APENAS CORREÇÃO JSON) para lotes subsequentes
                prompt = `Continue a correção.
Você é um Analista de Desempenho Escolar. Sua tarefa é corrigir o desempenho dos alunos no JSON abaixo com base no Gabarito Oficial (primeira linha).
O campo "Total_Questoes" deve ser **${totalQuestoes}**.
                
                Sua saída deve conter **APENAS** o Array JSON 'relatorio_alunos' seguindo o formato: \`\`\`json [ {"Aluno": "...", "Acertos": "...", ...}, ...] \`\`\`
                
                **Dados a Analisar (Gabarito + Alunos):** ${chunkJsonString}`;
            }

            // Retorna a Promessa da chamada à API (ela será executada em paralelo)
            return (async () => {
                let response;
                try {
                    response = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: prompt,
                        config: {
                            responseMimeType: 'text/plain', 
                            temperature: 0.1,
                        }
                    });
                } catch (apiError) {
                    // Propaga o erro com o índice do lote
                    throw new Error(`Falha na comunicação com a API do Gemini no Lote ${i + 1}. Detalhe: ${apiError.message}`);
                }
                
                // Retorna o índice e o texto completo para processamento posterior
                return { 
                    index: i, 
                    text: response.text.trim()
                };
            })();
        });
        
        // Espera que todas as chamadas à API sejam concluídas em paralelo
        const allResponses = await Promise.all(analysisPromises);
        
        let relatorioFinalDetalhado = [];
        let relatoriosObservacoes = [];
        
        // Processa as respostas
        // Usamos um for...of para processar na ordem em que foram retornadas
        for (const { index, text: fullText } of allResponses) {
            
            // 4. EXTRAÇÃO ROBUSTA E CONCATENAÇÃO
            const jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/);
            
            if (jsonMatch) {
                let jsonString = jsonMatch[1].trim();
                
                const firstBracket = jsonString.indexOf('[');
                const lastBracket = jsonString.lastIndexOf(']');

                if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                    jsonString = jsonString.substring(firstBracket, lastBracket + 1);
                }
                
                try {
                    const chunkRelatorio = JSON.parse(jsonString);
                    if (chunkRelatorio.length === 0) {
                        throw new Error("O JSON de resposta do Gemini estava vazio.");
                    }
                    relatorioFinalDetalhado = relatorioFinalDetalhado.concat(chunkRelatorio);
                } catch (e) {
                     // Retorna a mensagem de erro detalhada
                     throw new Error(`Erro de parsing do JSON no Lote ${index + 1}. O Gemini retornou um JSON inválido. Detalhe: ${e.message}`);
                }
            } else {
                throw new Error(`O Gemini não retornou o bloco \`\`\`json\`\`\` no Lote ${index + 1}.`);
            }
            
            // Apenas o lote 0 deve conter as observações.
            if (index === 0) {
                const textAfterJson = fullText.substring(jsonMatch.index + jsonMatch[0].length).trim();
                relatoriosObservacoes.push(textAfterJson);
            }
        }
        
        // --- 5. Montagem da Resposta Final ---
        // Note que o backend continua retornando uma única string `analysis` para o frontend.
        const relatorioJSONCompleto = `\`\`\`json\n${JSON.stringify(relatorioFinalDetalhado, null, 2)}\n\`\`\``;
        const relatorioFinalCompleto = relatorioJSONCompleto + "\n\n" + relatoriosObservacoes.join('\n');

        // Retorna a resposta de sucesso com status 200
        return res.status(200).json({
            success: true,
            analysis: relatorioFinalCompleto, 
            error: null 
        });

    } catch (e) {
        // Captura qualquer erro não tratado e formata como JSON de erro
        
        const statusCode = (e.message.includes("não contém dados") || e.message.includes("não contém marcações") || e.message.includes("GEMINI_API_KEY não está definida")) ? 400 : 500;

        console.error(`ERRO CRÍTICO NO HANDLER (Status ${statusCode}):`, e.message);
        return res.status(statusCode).json({ 
            success: false, 
            error: `Falha no processamento: ${e.message}`
        });
    }
};