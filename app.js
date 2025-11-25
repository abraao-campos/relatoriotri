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
    
    // Itera sobre as linhas de dados (começa da linha 1)
    for (let i = 1; i < lines.length; i++) {
        const currentLine = lines[i];
        if (!currentLine) continue;

        const values = currentLine.split(separator).map(value => value.trim());
        // Garante que o número de colunas bate com o cabeçalho
        if (values.length !== headers.length) {
            console.warn(`Linha ignorada devido a colunas inconsistentes: ${currentLine}`);
            continue;
        }

        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            // Cria o objeto { "Nome da Coluna": "Valor" }
            obj[headers[j]] = values[j];
        }
        result.push(obj);
    }
    
    // Retorna a string JSON compacta
    return JSON.stringify(result, null, 2); 
}


// Função auxiliar para ler um arquivo como texto, retornando uma Promise
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

document.getElementById('analiseForm').addEventListener('submit', async function(e) {
    e.preventDefault(); 
    
    const gabaritoInput = document.getElementById('arquivoGabarito');
    const resultadosInput = document.getElementById('arquivoResultados');
    const statusDiv = document.getElementById('status');
    const resultadoTexto = document.getElementById('resultadoTexto');
    const botao = document.getElementById('botaoAnalisar');

    // Verificação básica dos arquivos
    if (gabaritoInput.files.length === 0 || resultadosInput.files.length === 0) {
        alert("Por favor, selecione ambos os arquivos: Gabarito e Resultados.");
        return;
    }

    // Preparar o estado da interface
    botao.disabled = true;
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '⏳ Lendo arquivos no seu navegador...';
    statusDiv.classList.add('loading');
    resultadoTexto.textContent = 'A análise está sendo processada pelo Gemini. Por favor, aguarde...';

    const arquivoGabarito = gabaritoInput.files[0];
    const arquivoResultados = resultadosInput.files[0];

    try {
        // Leitura de ambos os arquivos de forma paralela
        const [rawGabarito, rawResultados] = await Promise.all([
            readFileAsText(arquivoGabarito),
            readFileAsText(arquivoResultados)
        ]);
        
        // NOVO PASSO: CONVERTER RAW TEXT (CSV) PARA JSON STRING
        statusDiv.innerHTML = '✨ Pré-processando dados no navegador...';

        const jsonGabarito = csvToJson(rawGabarito);
        const jsonResultados = csvToJson(rawResultados);

        // Verifica se a conversão resultou em JSON vazio
        if (jsonGabarito === "[]" || jsonResultados === "[]") {
             alert("A conversão JSON falhou. Seus arquivos CSV podem estar vazios ou o formato de codificação é incompatível.");
             botao.disabled = false;
             return;
        }

        // Dados a serem enviados para o backend
        const dadosParaEnvio = {
            gabaritoContent: jsonGabarito, 
            resultadosContent: jsonResultados,
            gabaritoFilename: arquivoGabarito.name,
            resultadosFilename: arquivoResultados.name
        };

        // Envia os dados para o backend
        await sendToBackend(dadosParaEnvio);

    } catch (error) {
        // Erro de leitura de arquivo (local)
        statusDiv.innerHTML = `❌ Erro ao ler um dos arquivos: ${error.message}`;
        botao.disabled = false;

    }
});


// Função responsável pela comunicação com o Backend Serverless
async function sendToBackend(data) {
    const statusDiv = document.getElementById('status');
    const botao = document.getElementById('botaoAnalisar');
    const resultadoTexto = document.getElementById('resultadoTexto');

    statusDiv.innerHTML = '🚀 Enviando dados e aguardando resposta do Gemini...';
    
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8' 
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            statusDiv.innerHTML = `✅ Análise concluída!`;
            statusDiv.classList.remove('loading');
            
            // >> NOVO PASSO: Formatação do Resultado (Chamada à nova função)
            resultadoTexto.innerHTML = formatAnalysisOutput(result.analysis);
            
        } else {
            // Erro retornado pelo backend
            statusDiv.innerHTML = `❌ Erro na análise: ${result.error}`;
            statusDiv.classList.remove('loading');
            resultadoTexto.textContent = `Não foi possível obter a análise. Detalhes: ${result.error}`;
        }

    } catch (error) {
        // Erro de rede ou comunicação
        statusDiv.innerHTML = '❌ Erro de conexão com o servidor de análise.';
        statusDiv.classList.remove('loading');
        resultadoTexto.textContent = `Erro de rede: ${error.message}`;

    } finally {
        // Reabilitar o botão
        botao.disabled = false;
    }
}


// >> NOVA FUNÇÃO: Transforma a resposta do Gemini em HTML formatado
function formatAnalysisOutput(analysisText) {
    try {
        // 1. Encontra e extrai o bloco JSON (o array de alunos)
        const jsonMatch = analysisText.match(/```json\n([\s\S]*?)\n```/);
        
        if (!jsonMatch) {
            // Se o JSON não for encontrado, retorna o texto bruto do Gemini
            return '<h3>Erro de Formato: JSON de Alunos não encontrado.</h3><p>O Gemini não forneceu o relatório de alunos no formato JSON esperado. Verifique o texto bruto:</p><pre>' + analysisText + '</pre>';
        }
        
        const jsonString = jsonMatch[1];
        // Parseia a lista de alunos (Array) diretamente
        const relatorio_alunos = JSON.parse(jsonString); 
        
        // 2. Extrai TUDO o que vem depois do bloco de código JSON (o resumo em Markdown)
        const jsonBlockEndIndex = jsonMatch.index + jsonMatch[0].length;
        let resumoMarkdown = analysisText.substring(jsonBlockEndIndex).trim();
        
        // Remove quaisquer quebras de linha ou espaços remanescentes antes do título.
        resumoMarkdown = resumoMarkdown.replace(/^[\s\r\n]+/g, '');

        // Fallback: se o resumo estiver vazio após a extração.
        if (resumoMarkdown.length < 10) {
             resumoMarkdown = '## Resumo Executivo da Turma\n\nNenhuma análise geral foi fornecida pelo Gemini (Resposta muito curta).';
        }
        
        let htmlOutput = '<h3>Relatório Detalhado por Aluno</h3><hr>';
        
        // 3. Formata o relatório por aluno
        relatorio_alunos.forEach(aluno => {
            const percent = parseFloat(aluno.Percentual_Acerto);
            // Escolhe a cor com base no desempenho
            const color = percent >= 80 ? '#28a745' : percent >= 50 ? '#ffc107' : '#dc3545'; 

            htmlOutput += `
                <div style="border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 8px; background-color: #fff;">
                    <h4 style="margin-top: 0; color: ${color};">${aluno.Aluno}</h4>
                    <ul style="list-style-type: none; padding: 0;">
                        <li><strong>Total de Questões:</strong> ${aluno.Total_Questoes}</li>
                        <li><strong>✅ Acertos:</strong> <span style="color: #28a745;">${aluno.Acertos}</span></li>
                        <li><strong>❌ Erros:</strong> <span style="color: #dc3545;">${aluno.Erros}</span></li>
                        <li><strong>% de Acerto:</strong> <strong style="color: ${color};">${aluno.Percentual_Acerto}%</strong></li>
                    </ul>
                </div>
            `;
        });
        
        // 4. Converte o Resumo Markdown em HTML simples (pode ser melhorado com bibliotecas, mas isso funciona para o básico)
        const resumoHtml = resumoMarkdown
            .replace(/##/g, '<h4>') // Títulos (deve transformar ## Resumo Executivo em <h4>)
            .replace(/\*/g, '•') // Listas
            .replace(/\n/g, '<br>'); // Quebra de linha
            
        htmlOutput += `<br><h3>Análise Geral de Desempenho da Turma</h3><hr><div>${resumoHtml}</div>`;

        return htmlOutput;

    } catch (e) {
        // Se houver erro na formatação (JSON mal formado), retorna o texto bruto com erro
        console.error("Erro na Formatação do JSON:", e);
        return '<h3>Erro ao processar o JSON de Resultados</h3><p>Ocorreu um erro ao tentar ler os dados detalhados. Verifique se o Gemini retornou os dados no formato esperado. Detalhes do erro: ' + e.message + '</p><pre>' + analysisText + '</pre>';
    }
}
