// api/analyze.js - Código Completo e Integrado para Serverless

const { GoogleGenAI } = require('@google/genai');
// A chave será carregada automaticamente se o nome for GEMINI_API_KEY
const ai = new GoogleGenAI({}); 

// --- Função Helper: Chunking ---
function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// --- Handler Principal (Exportação) ---
// Esta função é o ponto de entrada para a rota /api/analyze

module.exports = async (req, res) => {
    
    // Configura o header de Content-Type para JSON
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // Retorna 405 se o método não for POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: "Método não permitido. Use POST." });
    }

    // O grande bloco try/catch captura erros críticos e garante que a função 
    // termine com uma resposta HTTP correta (200, 400 ou 500).
    try {
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
        const alunoChunks = chunkArray(alunosParaCorrigir, 15);
        
        let relatorioFinalDetalhado = [];
        let relatoriosObservacoes = [];
        
        for (let i = 0; i < alunoChunks.length; i++) {
            const chunk = alunoChunks[i];
            const chunkData = [gabaritoOficial, ...chunk];
            const chunkJsonString = JSON.stringify(chunkData, null, 2);
            
            let prompt;

            if (i === 0) {
                // Prompt completo para o primeiro lote (inclui análise qualitativa)
                prompt = `Você é um Analista de Desempenho Escolar. Sua tarefa é corrigir e analisar o desempenho dos alunos com base no Gabarito Oficial fornecido na primeira linha do JSON.
                
                **Instruções de Saída:**
                1. **Correção Detalhada (Bloco JSON):** Gere um Array JSON chamado 'relatorio_alunos' para CADA ALUNO corrigido neste bloco. O Array deve conter as chaves: "Aluno", "Acertos", "Erros", "Percentual_Acerto" (formatado com 2 casas decimais e vírgula como separador). O campo "Total_Questoes" deve ser **${totalQuestoes}**.
                2. **Métricas Chave (Próxima Seção):** Calcule e liste a Média, a Maior e a Menor Pontuação de Acertos APENAS para os alunos neste lote.
                3. **Observações Gerais (Bloco TEXT):** APENAS no primeiro lote (Chunk 0), forneça uma análise qualitativa detalhada de 300 palavras sobre o desempenho geral da turma, identificando pontos fortes e fracos, e sugerindo intervenções pedagógicas.
                
                Siga **EXATAMENTE** este formato para a saída: \`\`\`json [...] \`\`\` **Média de Acertos:** [...] **Maior Pontuação:** [...] **Menor Pontuação:** [...] \`\`\`text Observações Gerais: [...] \`\`\`
                
                **Dados a Analisar (Gabarito + Alunos):** ${chunkJsonString}`;
                
            } else {
                // Prompt simplificado (APENAS CORREÇÃO JSON) para lotes subsequentes
                prompt = `Continue a correção. Você é um Analista de Desempenho Escolar. Sua tarefa é corrigir o desempenho dos alunos no JSON abaixo com base no Gabarito Oficial (primeira linha). O campo "Total_Questoes" deve ser **${totalQuestoes}**.
                
                Sua saída deve conter **APENAS** o Array JSON 'relatorio_alunos' seguindo o formato: \`\`\`json [ {"Aluno": "...", "Acertos": "...", ...}, ...] \`\`\`
                
                **Dados a Analisar (Gabarito + Alunos):** ${chunkJsonString}`;
            }
            
            // 3. Chamada à API e Tratamento de Erro (API)
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
                throw new Error(`Falha na comunicação com a API do Gemini no Lote ${i + 1}. Verifique sua chave API. Detalhe: ${apiError.message}`);
            }

            // 4. Extração e Concatenação
            const fullText = response.text.trim();
            const jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/);
            
            if (jsonMatch) {
                try {
                    const chunkRelatorio = JSON.parse(jsonMatch[1]);
                    if (chunkRelatorio.length === 0) {
                        throw new Error("O JSON de resposta do Gemini estava vazio.");
                    }
                    relatorioFinalDetalhado = relatorioFinalDetalhado.concat(chunkRelatorio);
                } catch (e) {
                     throw new Error(`Erro de parsing do JSON no Lote ${i + 1}. O Gemini retornou um JSON inválido. Detalhe: ${e.message}`);
                }
            } else {
                throw new Error(`O Gemini não retornou o bloco \`\`\`json\`\`\` no Lote ${i + 1}.`);
            }
            
            if (i === 0) {
                const textAfterJson = fullText.substring(jsonMatch.index + jsonMatch[0].length).trim();
                relatoriosObservacoes.push(textAfterJson);
            }
        }

        // --- 5. Montagem da Resposta Final ---
        const relatorioJSONCompleto = `\`\`\`json\n${JSON.stringify(relatorioFinalDetalhado, null, 2)}\n\`\`\``;
        const relatorioFinalCompleto = relatorioJSONCompleto + "\n\n" + relatoriosObservacoes.join('\n');

        // Retorna a resposta de sucesso com status 200
        return res.status(200).json({
            success: true,
            analysis: relatorioFinalCompleto, 
            error: null 
        });

    } catch (e) {
        // Se qualquer erro ocorrer (API, JSON.parse, etc.), ele é capturado aqui,
        // garantindo que o Status 500 seja evitado e o frontend receba uma mensagem JSON controlada.
        
        // Determina o status: 400 para erros do usuário/input, 500 para falha interna ou de API
        const statusCode = (e.message.includes("não contém dados") || e.message.includes("não contém marcações")) ? 400 : 500;

        console.error(`ERRO CRÍTICO NO HANDLER (Status ${statusCode}):`, e.message);
        
        // Retorna a resposta de erro com o status apropriado
        return res.status(statusCode).json({ 
            success: false, 
            error: `Falha no processamento: ${e.message}`
        });
    }
};
