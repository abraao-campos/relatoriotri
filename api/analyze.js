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
        const alunoChunks = chunkArray(alunosParaCorrigir, 15);
        let relatorioFinalDetalhado = [];
        let relatoriosObservacoes = [];
        
        for (let i = 0; i < alunoChunks.length; i++) {
            const chunk = alunoChunks[i];
            const chunkData = [gabaritoOficial, ...chunk];
            const chunkJsonString = JSON.stringify(chunkData, null, 2);
            
            let prompt;
            if (i === 0) {
                // Prompt completo para o primeiro lote
                prompt = `Você é um Analista de Desempenho Escolar.
Sua tarefa é corrigir e analisar o desempenho dos alunos com base no Gabarito Oficial fornecido na primeira linha do JSON.
**Instruções de Saída:**
                1. **Correção Detalhada (Bloco JSON):** Gere um Array JSON chamado 'relatorio_alunos' para CADA ALUNO corrigido neste bloco.
O Array deve conter as chaves: "Aluno", "Acertos", "Erros", "Percentual_Acerto" (formatado com 2 casas decimais e vírgula como separador).
O campo "Total_Questoes" deve ser **${totalQuestoes}**.
                2. **Métricas Chave (Próxima Seção):** Calcule e liste a Média, a Maior e a Menor Pontuação de Acertos APENAS para os alunos neste lote.
3. **Observações Gerais (Bloco TEXT):** APENAS no primeiro lote (Chunk 0), forneça uma análise qualitativa detalhada de 300 palavras sobre o desempenho geral da turma, identificando pontos fortes e fracos, e sugerindo intervenções pedagógicas.
Siga **EXATAMENTE** este formato para a saída: \`\`\`json [...] \`\`\` **Média de Acertos:** [...] **Maior Pontuação:** [...] **Menor Pontuação:** [...] \`\`\`text Observações Gerais: [...] \`\`\`
                
                **Dados a Analisar (Gabarito + Alunos):** ${chunkJsonString}`;
            } else {
                // Prompt simplificado (APENAS
