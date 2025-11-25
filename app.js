// URL da sua função serverless.
const BACKEND_URL = '/api/analyze'; 

// FUNÇÃO CHAVE: Converte o texto CSV bruto em um Array de Objetos JSON
function csvToJson(csvContent) {
    if (!csvContent) return "[]";
    
    // >> SOLUÇÃO FINAL PARA ERRO DE LEITURA: NORMALIZAÇÃO DE QUEBRA DE LINHA
    // Trata \r\n (Windows), \r (Mac antigo) e \n (Linux/Web) para garantir a divisão correta.
    const normalizedContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Divide o conteúdo em linhas e remove linhas vazias/apenas espaço
    const lines = normalizedContent.split('\n').filter(line => line.trim() !== '');

    // Se não houver linhas, retorna um JSON vazio.
    if (lines.length === 0) {
        console.error("CSV vazio após filtragem de linhas. O arquivo pode estar vazio ou a codificação está incorreta.");
        return "[]"; 
    }
    
    // Detecta o separador: tenta ponto-e-vírgula ou vírgula
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
            // ENVIAMOS AGORA A STRING JSON, NÃO MAIS O TEXTO BRUTO
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
                // REFORÇO: Garante que o JSON e a codificação UTF-8 sejam reconhecidos
                'Content-Type': 'application/json; charset=utf-8' 
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            // Sucesso na análise
            statusDiv.innerHTML = `✅ Análise concluída para os arquivos!`;
            statusDiv.classList.remove('loading');
            resultadoTexto.textContent = result.analysis;
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
