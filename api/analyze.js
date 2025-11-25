// api/analyze.js
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({}); // Assume que a chave API está configurada no ambiente

// Função para dividir o array de alunos em lotes
function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// Função de Correção e Análise do Gemini
async function analyze(resultadosContent, resultadosFilename) {
    
    // 1. Extrair o Gabarito e os Alunos
    const alunos = JSON.parse(resultadosContent);

    // O Gabarito Oficial deve ser a primeira linha de dados.
    if (alunos.length === 0) {
        throw new Error("O arquivo de resultados não contém dados após a conversão.");
    }

    const gabaritoOficial = alunos[0];
    const alunosParaCorrigir = alunos.slice(1); // O resto são os alunos
    const totalQuestoes = Object.keys(gabaritoOficial).length - 1; // Nome + 45 questões = 46 colunas

    if (alunosParaCorrigir.length === 0) {
        throw new Error("O arquivo não contém marcações de alunos para corrigir.");
    }
    
    // 2. Dividir os alunos em CHUNKS (Lotes de, no máximo, 15)
    // 15 é um número seguro para o limite de tokens de saída.
    const alunoChunks = chunkArray(alunosParaCorrigir, 15);
    
    let relatorioFinalDetalhado = [];
    let relatoriosObservacoes = [];
    let promptBase = '';
    
    // 3. Processar cada CHUNK
    for (let i = 0; i < alunoChunks.length; i++) {
        const chunk = alunoChunks[i];
        
        // Constrói um objeto para o Gabarito e o chunk atual de alunos
        const chunkData = [gabaritoOficial, ...chunk];
        const chunkJsonString = JSON.stringify(chunkData, null, 2);
        
        let prompt;

        // O prompt mais complexo (com análise) é enviado apenas para o primeiro lote (Chunk 0)
        if (i === 0) {
            prompt = `Você é um Analista de Desempenho Escolar. Sua tarefa é corrigir e analisar o desempenho dos alunos com base no Gabarito Oficial fornecido na primeira linha do JSON.
            
            **Instruções de Saída:**
            1. **Correção Detalhada (Bloco JSON):** Gere um Array JSON chamado 'relatorio_alunos' para CADA ALUNO corrigido neste bloco. O Array deve conter as chaves: "Aluno", "Acertos", "Erros", "Percentual_Acerto" (formatado com 2 casas decimais e vírgula como separador). O campo "Total_Questoes" deve ser **${totalQuestoes}**.
            2. **Métricas Chave (Próxima Seção):** Calcule e liste a Média, a Maior e a Menor Pontuação de Acertos APENAS para os alunos neste lote.
            3. **Observações Gerais (Bloco TEXT):** APENAS no primeiro lote (Chunk 0), forneça uma análise qualitativa detalhada de 300 palavras sobre o desempenho geral da turma, identificando pontos fortes e fracos, e sugerindo intervenções pedagógicas.
            
            Siga **EXATAMENTE** este formato para a saída (incluindo os delimitadores \`\`\`json e \`\`\`text):
            
            \`\`\`json
            [
              {"Aluno": "...", "Acertos": "...", "Erros": "...", "Percentual_Acerto": "...", "Total_Questoes": "${totalQuestoes}"},
              ...
            ]
            \`\`\`
            
            **Média de Acertos:** (Valor da Média)
            **Maior Pontuação:** (Valor do Máximo)
            **Menor Pontuação:** (Valor do Mínimo)
            
            \`\`\`text
            Observações Gerais:
            [... Sua análise qualitativa aqui ...]
            \`\`\`
            
            **Dados a Analisar (Gabarito + Alunos):**
            ${chunkJsonString}`;
            
            promptBase = prompt; // Armazena o prompt base para referência

        } else {
            // Prompts simplificados (APENAS CORREÇÃO JSON) para os lotes subsequentes
            prompt = `Continue a correção. Você é um Analista de Desempenho Escolar. Sua tarefa é corrigir o desempenho dos alunos no JSON abaixo com base no Gabarito Oficial (primeira linha). O campo "Total_Questoes" deve ser **${totalQuestoes}**.
            
            Sua saída deve conter **APENAS** o Array JSON 'relatorio_alunos' (sem as Métricas Chave e sem as Observações Gerais) seguindo o formato:
            
            \`\`\`json
            [
              {"Aluno": "...", "Acertos": "...", "Erros": "...", "Percentual_Acerto": "...", "Total_Questoes": "${totalQuestoes}"},
              ...
            ]
            \`\`\`
            
            **Dados a Analisar (Gabarito + Alunos):**
            ${chunkJsonString}`;
        }
        
        // 4. Chamada ao Gemini para o lote atual
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                // Configurações para forçar o JSON na primeira parte, mesmo que o modelo não retorne JSON puro.
                // Isto aumenta a chance de sucesso na extração por Regex.
                responseMimeType: 'text/plain', 
                temperature: 0.1,
            }
        });

        const fullText = response.text.trim();

        // 5. Extração e Concatenção dos Resultados
        
        // Extrai o bloco JSON (relatório de alunos)
        const jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            try {
                // Tenta fazer o parsing para garantir que não está cortado e que é válido
                const chunkRelatorio = JSON.parse(jsonMatch[1]);
                relatorioFinalDetalhado = relatorioFinalDetalhado.concat(chunkRelatorio);
            } catch (e) {
                 // Se o JSON estiver cortado ou inválido (muito comum em chunks grandes),
                 // o loop será interrompido e você obterá um erro claro.
                 throw new Error(`Erro de parsing do JSON no Lote ${i + 1}. A resposta do Gemini pode ter sido cortada. Tente reduzir o tamanho do lote.`);
            }
        } else {
            throw new Error(`O Gemini não retornou o bloco \`\`\`json\`\`\` no Lote ${i + 1}.`);
        }
        
        // Guarda as métricas e observações APENAS do primeiro lote (Chunk 0)
        if (i === 0) {
            // Pega todo o texto, exceto o JSON, que contém as Métricas Chave e o Bloco TEXT
            const textAfterJson = fullText.substring(jsonMatch.index + jsonMatch[0].length).trim();
            relatoriosObservacoes.push(textAfterJson);
        }
    }

    // 6. Montar o Relatório Final (Apenas do Chunk 0 + o JSON completo)
    const relatorioJSONCompleto = `\`\`\`json\n${JSON.stringify(relatorioFinalDetalhado, null, 2)}\n\`\`\``;
    
    // Concatena o JSON completo com as métricas/observações do primeiro lote
    const relatorioFinalCompleto = relatorioJSONCompleto + "\n\n" + relatoriosObservacoes.join('\n');


    return {
        // Envia o texto completo para o frontend para a extração final
        analysis: relatorioFinalCompleto, 
        // Você pode retornar o prompt base para debug, se necessário
        promptUsed: promptBase 
    };
}

module.exports = { analyze };
