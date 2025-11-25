// URL da sua função serverless.
const BACKEND_URL = '/api/analyze'; 

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
        const [contentGabarito, contentResultados] = await Promise.all([
            readFileAsText(arquivoGabarito),
            readFileAsText(arquivoResultados)
        ]);

        // Dados a serem enviados para o backend
        const dadosParaEnvio = {
            gabaritoContent: contentGabarito,
            resultadosContent: contentResultados,
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
            // Erro retornado pelo backend (Inclui o erro de "conteúdos obrigatórios")
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
