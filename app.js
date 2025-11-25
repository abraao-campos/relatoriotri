// URL da sua função serverless.
const BACKEND_URL = '/api/analyze'; 

// FUNÇÃO CHAVE: Converte o texto CSV bruto em um Array de Objetos JSON
function csvToJson(csvContent) {
    if (!csvContent) return [];
    
    // Divide o conteúdo em linhas
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');

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
        if (values.length !== headers.length) {
            // Se o número de colunas for inconsistente, ignora ou alerta
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
    // ... (restante das variáveis)

    // ... (verificações iniciais e status updates)

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

        if (jsonGabarito.length < 5 || jsonResultados.length < 5) {
             alert("A conversão JSON falhou ou resultou em dados vazios. Verifique o formato do seu CSV (separadores, cabeçalho).");
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
        // ... (erro de leitura de arquivo)
    }
});


// Função responsável pela comunicação com o Backend Serverless (Sem Alterações)
async function sendToBackend(data) {
    // ... (código da função sendToBackend permanece o mesmo) ...
    // É crucial que headers: {'Content-Type': 'application/json; charset=utf-8'} permaneça.
    // ...
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
            statusDiv.innerHTML = `✅ Análise concluída para os arquivos!`;
            statusDiv.classList.remove('loading');
            resultadoTexto.textContent = result.analysis;
        } else {
            statusDiv.innerHTML = `❌ Erro na análise: ${result.error}`;
            statusDiv.classList.remove('loading');
            resultadoTexto.textContent = `Não foi possível obter a análise. Detalhes: ${result.error}`;
        }

    } catch (error) {
        statusDiv.innerHTML = '❌ Erro de conexão com o servidor de análise.';
        statusDiv.classList.remove('loading');
        resultadoTexto.textContent = `Erro de rede: ${error.message}`;

    } finally {
        botao.disabled = false;
    }
}
