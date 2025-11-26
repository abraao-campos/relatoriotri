// URL da sua função serverless.
const BACKEND_URL = '/api/analyze'; 

// FUNÇÃO CHAVE: Converte o texto CSV bruto em um Array de Objetos JSON
function csvToJson(csvContent) {
    if (!csvContent) return "[]";
    
    // Solução de Robustez: Limpeza e Normalização de Quebra de Linha
    let normalizedContent = csvContent
        .replace(/\r\n/g, '\n') // Trata Windows CRLF
        .replace(/\r/g, '\n')   // Trata Mac antigo CR
        .replace(/[\u200B-\u200D\uFEFF]/g, ''); // Remove BOM e caracteres invisíveis

    // Divide o conteúdo em linhas e remove linhas vazias/apenas espaço
    const lines = normalizedContent.split('\n').filter(line => line.trim() !== '');

    // Se não houver linhas após a limpeza
    if (lines.length === 0) {
        console.error("CSV vazio após filtragem de linhas.");
        return "[]"; 
    }
    
    // Detecta o separador: tenta ponto-e-vírgula ou vírgula (padrão internacional)
    let separator = lines[0].includes(';') ? ';' : ',';
    
    // Obtém e limpa os cabeçalhos (primeira linha)
    const headers = lines[0].split(separator).map(header => header.trim());
    
    const result = [];
    
    // Itera sobre as linhas de dados (a partir da segunda linha, pois a primeira é o cabeçalho)
    for (let i = 1; i < lines.length; i++) {
        const currentline = lines[i];
        const values = currentline.split(separator).map(value => value.trim());
        
        // Ignora linhas que não têm o número correto de colunas (proteção extra)
        if (values.length !== headers.length) {
            console.warn(`Linha ${i + 1} ignorada: número de colunas (${values.length}) não corresponde ao cabeçalho (${headers.length}).`);
            continue;
        }
        
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = values[j];
        }
        result.push(obj);
    }
    
    return JSON.stringify(result, null, 2);
}

/**
 * Função responsável por renderizar os resultados na interface.
 * @param {string} relatorioJSON - String contendo o JSON estruturado.
 * @param {string} observacoesTexto - Texto de observações fora do JSON.
 */
function renderizarResultados(relatorioJSON, observacoesTexto) {
    const resultadoDiv = document.getElementById('resultadoAnalise');
    const estatisticasDiv = document.getElementById('estatisticasGerais');
    const relatorioTextoDiv = document.getElementById('relatorioTexto');
    const analiseDetalhadaDiv = document.getElementById('analiseDetalhada');
    
    resultadoDiv.style.display = 'block';
    
    // 1. Limpa as seções
    estatisticasDiv.innerHTML = '';
    relatorioTextoDiv.innerHTML = '';
    analiseDetalhadaDiv.innerHTML = '';

    let relatorio;
    try {
        relatorio = JSON.parse(relatorioJSON);
    } catch (e) {
        // Se a IA não retornou um JSON válido (erro inesperado)
        console.error("Erro ao parsear JSON:", e);
        relatorioTextoDiv.innerHTML = `
            <div style="background-color: #f8d7da; color: #721c24; padding: 15px; border-radius: 6px; border: 1px solid #f5c6cb;">
                <strong>Erro de Formato:</strong> O relatório principal não é um JSON válido. Exibindo apenas o texto de observação.<br>
                <strong style="display: block; margin-top: 10px;">Erro de Parsing:</strong> ${e.message}
            </div>
            <div style="margin-top: 15px; padding-left: 5px; color: #555;">${observacoesTexto}</div>
        `;
        return;
    }
    
    // 2. Extrai dados do JSON
    const { 
        analiseGeral, 
        analisePorQuestao, 
        analisePorAluno, 
        maiorPontuacao, 
        menorPontuacao 
    } = relatorio;

    // Garante que os valores existam ou usa um fallback
    const geral = analiseGeral || {};
    const questoes = analisePorQuestao || [];
    const alunos = analisePorAluno || [];
    const maior = maiorPontuacao !== undefined ? maiorPontuacao : 'N/A';
    const menor = menorPontuacao !== undefined ? menorPontuacao : 'N/A';
    
    // 3. Monta as Estatísticas Gerais (Top Box)
    let statsHtml = `
        <div style="background-color: #fff; padding: 15px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #007bff;">Média de Acertos</strong>
            <h4 style="margin: 0; color: #007bff;">${geral.mediaAcertos || 'N/A'}</h4>
        </div>
        
        <div style="background-color: #fff; padding: 15px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #28a745;">Maior Pontuação</strong>
            <h4 style="margin: 0; color: #28a745;">${maior} Acertos</h4>
        </div>
        
        <div style="background-color: #fff; padding: 15px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #dc3545;">Menor Pontuação</strong>
            <h4 style="margin: 0; color: #dc3545;">${menor} Acertos</h4>
        </div>
    `;
    estatisticasDiv.innerHTML = statsHtml;
    
    // 4. Monta o Relatório de Texto/Observações
    const observacoesHtml = observacoesTexto.split('\n').map(p => p.trim()).filter(p => p.length > 0).join('<br>');

    relatorioTextoDiv.innerHTML = `
        <div style="background-color: #fff; padding: 15px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <strong style="display: block; margin-bottom: 8px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">Relatório de Desempenho (Observações Gerais):</strong>
            <div style="padding-left: 5px; color: #555;">
                ${observacoesHtml || 'Nenhuma observação textual foi gerada pelo Gemini.'}
            </div>
        </div>
    `;

    // 5. Monta a Análise Detalhada (Por Questão)
    let analiseQuestaoHtml = '<h3>Análise Detalhada por Questão</h3>';
    analiseQuestaoHtml += `<p>${questoes.length} Questões analisadas.</p>`;
    analiseQuestaoHtml += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px; margin-top: 15px;">';

    questoes.forEach(q => {
        const acertoPercent = q.percentualAcerto || 0;
        let corBorda = '#dc3545'; // Vermelho (Baixo)
        if (acertoPercent >= 70) corBorda = '#28a745'; // Verde (Alto)
        else if (acertoPercent >= 40) corBorda = '#ffc107'; // Amarelo (Médio)

        analiseQuestaoHtml += `
            <div style="border: 1px solid #eee; border-left: 4px solid ${corBorda}; padding: 15px; border-radius: 6px; background-color: #fcfcfc; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <strong style="font-size: 1.1em; color: ${corBorda};">Questão ${q.numero || 'N/A'}</strong> 
                <span style="float: right; font-weight: bold; color: #343a40;">${acertoPercent}% Acerto</span>
                <p style="margin: 5px 0 0; font-size: 0.9em; color: #6c757d;">Habilidade: ${q.habilidade || 'N/A'}</p>
                <p style="margin: 0; font-size: 0.9em; color: #6c757d;">Foco: ${q.foco || 'N/A'}</p>
                <p style="margin-top: 10px; font-size: 0.95em; color: #555;">${q.resumoDesempenho || 'Sem resumo.'}</p>
            </div>
        `;
    });

    analiseQuestaoHtml += '</div>';
    analiseDetalhadaDiv.innerHTML += analiseQuestaoHtml;

    // 6. Monta a Análise Detalhada (Por Aluno)
    let analiseAlunoHtml = '<h3>Feedback Individual por Aluno</h3>';
    analiseAlunoHtml += `<p>${alunos.length} Alunos avaliados.</p>`;
    analiseAlunoHtml += '<div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 15px; border-radius: 6px; margin-top: 15px;">';

    alunos.forEach(a => {
        analiseAlunoHtml += `
            <div style="background-color: #f9f9f9; padding: 10px; margin-bottom: 10px; border-radius: 4px; border-left: 3px solid #007bff;">
                <strong style="color: #007bff;">${a.nome || 'Aluno'}</strong> 
                <span style="float: right; font-weight: bold; color: #343a40;">Pontuação: ${a.pontuacao || 'N/A'}</span>
                <p style="margin: 5px 0 0; font-size: 0.9em; color: #555;">${a.feedback || 'Sem feedback individual.'}</p>
            </div>
        `;
    });
    
    analiseAlunoHtml += '</div>';
    analiseDetalhadaDiv.innerHTML += analiseAlunoHtml;
}


// --- Lógica Principal (Eventos) ---

document.addEventListener('DOMContentLoaded', () => {
    const formAnalise = document.getElementById('formAnalise');
    const arquivoInput = document.getElementById('arquivoResultados');
    const promptInput = document.getElementById('promptOpcional');
    const statusDiv = document.getElementById('status');
    const botaoAnalisar = document.getElementById('botaoAnalisar');

    formAnalise.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Coleta e Validação do Arquivo
        const file = arquivoInput.files[0];
        if (!file) {
            statusDiv.className = 'error';
            statusDiv.textContent = 'Por favor, selecione um arquivo CSV.';
            return;
        }

        statusDiv.className = 'loading';
        statusDiv.textContent = 'Aguardando leitura do arquivo...';
        botaoAnalisar.disabled = true;

        const reader = new FileReader();

        reader.onload = async (event) => {
            const resultadosContent = event.target.result;
            const promptOpcional = promptInput.value.trim();

            statusDiv.textContent = 'Enviando dados para o Gemini... (Pode demorar um pouco)';

            try {
                // 2. Converte CSV para JSON (apenas para facilitar a comunicação)
                const alunosJson = csvToJson(resultadosContent);
                
                if (alunosJson === "[]") {
                     throw new Error("O arquivo está vazio ou não contém dados de alunos após o gabarito.");
                }

                // 3. Chamada à API Serverless (Backend)
                const response = await fetch(BACKEND_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        alunosOriginal: alunosJson, // Envia o JSON dos alunos
                        resultadosContent: resultadosContent, // Envia o CSV bruto também para o gabarito
                        promptOpcional: promptOpcional
                    })
                });

                const data = await response.json();
                
                // 4. Tratamento da Resposta
                if (data.success) {
                    statusDiv.className = 'success';
                    statusDiv.textContent = '✅ Análise Concluída com Sucesso!';

                    const fullAnalysis = data.analysis; 
                    
                    // Regex para encontrar o bloco JSON envolvido em ```json\n...\n```
                    const jsonMatch = fullAnalysis.match(/```json\n([\s\S]*?)\n```/);
                    
                    if (jsonMatch && jsonMatch[1]) {
                        const jsonPart = jsonMatch[1].trim();
                        
                        // Extração do texto de observação de forma mais segura.
                        // Remove o bloco ```json...``` da análise completa.
                        const textPart = fullAnalysis.replace(jsonMatch[0], '').trim(); 
                        
                        renderizarResultados(jsonPart, textPart);
                    } else {
                        // Se o JSON não foi encontrado no formato esperado
                        // Exibe a resposta bruta do Gemini no local do relatório para debug.
                        document.getElementById('resultadoAnalise').style.display = 'block';
                        document.getElementById('relatorioTexto').innerHTML = `
                            <div style="background-color: #ffebee; color: #e53935; padding: 15px; border-radius: 6px; border: 1px solid #e53935;">
                                <strong>Erro de Formato:</strong> A IA não retornou o JSON estruturado esperado.
                                <strong style="display: block; margin-top: 10px;">Resposta Bruta do Gemini:</strong>
                                <pre style="white-space: pre-wrap; word-break: break-all;">${fullAnalysis}</pre>
                            </div>
                        `;
                        throw new Error("O servidor não retornou a análise JSON estruturada no formato esperado. Verifique a resposta bruta.");
                    }

                } else {
                    throw new Error(data.error || 'Erro desconhecido na análise.');
                }

            } catch (error) {
                console.error("Erro na análise:", error);
                statusDiv.className = 'error';
                // Adiciona uma mensagem para o usuário verificar o console se o erro for no parsing
                const userMessage = error.message.includes("O servidor não retornou a análise JSON estruturada") 
                    ? "❌ Falha ao processar a resposta do Gemini. Consulte a resposta bruta na tela." 
                    : `❌ Erro: ${error.message}`;
                    
                statusDiv.textContent = userMessage;
            } finally {
                botaoAnalisar.disabled = false;
            }
        };

        reader.onerror = () => {
            statusDiv.className = 'error';
            statusDiv.textContent = '❌ Erro ao ler o arquivo.';
            botaoAnalisar.disabled = false;
        };

        reader.readAsText(file);
    });
});
