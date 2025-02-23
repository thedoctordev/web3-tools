let web3;

async function connectWallet() {
    try {
        console.log("Verificando Metamask...");
        if (typeof window.ethereum === "undefined") {
            console.log("Metamask não encontrada");
            alert("Por favor, instale a Metamask!");
            return;
        }

        // Mostra o loading da carteira
        document.getElementById("walletInfo").classList.remove("hidden");
        document.getElementById("addressInfo").classList.add("hidden");
        document.getElementById("addressLoading").classList.remove("hidden");
        
        console.log("Metamask encontrada, solicitando contas...");
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        
        console.log("Contas autorizadas, inicializando Web3...");
        web3 = new Web3(window.ethereum);
        
        const address = accounts[0];
        console.log("Endereço obtido:", address);
        
        // Salva o endereço no localStorage
        saveWalletAddress(address);
        
        // Atualiza o texto do botão
        updateConnectButton(true);
        
        // Esconde o loading e mostra o endereço
        document.getElementById("addressLoading").classList.add("hidden");
        document.getElementById("addressInfo").classList.remove("hidden");
        document.getElementById("walletAddress").textContent = address;
        
        // Busca os saldos
        await updateBalances(address);
        
        // Adiciona listener para mudança de rede
        window.ethereum.on("chainChanged", () => window.location.reload());
        
    } catch (error) {
        // Em caso de erro, esconde todos os loadings
        document.getElementById("addressLoading").classList.add("hidden");
        document.getElementById("balanceLoading").classList.add("hidden");
        console.error("Erro detalhado:", error);
        alert("Erro ao conectar com a Metamask: " + error.message);
    }
}

async function getNetworkName(chainId) {
    try {
        // Tenta buscar do cache primeiro
        const cachedData = localStorage.getItem(`network-${chainId}`);
        if (cachedData) {
            return JSON.parse(cachedData).name;
        }

        const response = await fetch(`https://chainid.network/chains.json`);
        if (!response.ok) throw new Error('Erro ao buscar dados da rede');
        
        const chains = await response.json();
        const chain = chains.find(chain => chain.chainId === chainId);
        
        if (chain) {
            // Salva no cache
            localStorage.setItem(`network-${chainId}`, JSON.stringify({
                name: chain.name,
                timestamp: Date.now()
            }));
            return chain.name;
        }
        
        return `Chain ID: ${chainId}`;
    } catch (error) {
        console.error("Erro ao buscar nome da rede:", error);
        return `Chain ID: ${chainId}`;
    }
}

async function getTokenInfo(chainId) {
    try {
        // Tenta buscar do cache primeiro
        const cachedData = localStorage.getItem(`chain-${chainId}`);
        if (cachedData) {
            const cached = JSON.parse(cachedData);
            // Verifica se o cache tem menos de 1 dia
            if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
                return cached.tokenInfo;
            }
        }

        // Busca informações da rede da API do Chainlist
        const response = await fetch(`https://chainid.network/chains.json`);
        if (!response.ok) throw new Error('Erro ao buscar dados da rede');
        
        const chains = await response.json();
        const chain = chains.find(chain => chain.chainId === chainId);

        if (chain) {
            // Extrai o símbolo da moeda nativa e tenta encontrar o ID do Coingecko
            const symbol = chain.nativeCurrency?.symbol || 'Tokens';
            const name = chain.nativeCurrency?.name?.toLowerCase() || '';
            
            // Tenta encontrar um ID do Coingecko baseado no nome/símbolo
            let coingeckoId = null;
            if (name.includes('ether')) coingeckoId = 'ethereum';
            else if (name.includes('bnb')) coingeckoId = 'binancecoin';
            else if (name.includes('matic')) coingeckoId = 'matic-network';
            else if (name.includes('avax')) coingeckoId = 'avalanche-2';
            else if (name.includes('fantom')) coingeckoId = 'fantom';

            const tokenInfo = { symbol, coingeckoId };

            // Salva no cache
            localStorage.setItem(`chain-${chainId}`, JSON.stringify({
                tokenInfo,
                timestamp: Date.now()
            }));

            return tokenInfo;
        }
        
        return { symbol: 'Tokens', coingeckoId: null };
    } catch (error) {
        console.error("Erro ao buscar informações do token:", error);
        return { symbol: 'Tokens', coingeckoId: null };
    }
}

async function getTokenPrice(coingeckoId) {
    try {
        if (!coingeckoId) return null;

        // Tenta buscar do cache primeiro
        const cachedData = localStorage.getItem(`price-${coingeckoId}`);
        if (cachedData) {
            const cached = JSON.parse(cachedData);
            // Verifica se o cache tem menos de 5 minutos
            if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
                return cached.price;
            }
        }

        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`
        );
        
        if (!response.ok) throw new Error('Erro ao buscar preço');
        
        const data = await response.json();
        const price = data[coingeckoId].usd;

        // Salva no cache
        localStorage.setItem(`price-${coingeckoId}`, JSON.stringify({
            price,
            timestamp: Date.now()
        }));

        return price;
    } catch (error) {
        console.error("Erro ao buscar preço:", error);
        return null;
    }
}

async function getTokenBalances(address, chainId) {
    try {
        // Mapeamento de Chain ID para o formato do Moralis
        const chainMap = {
            1: 'eth',
            56: 'bsc',
            137: 'polygon',
            43114: 'avalanche',
            42161: 'arbitrum',
            10: 'optimism'
        };

        const chain = chainMap[chainId] || 'eth';
        const response = await fetch(
            `https://deep-index.moralis.io/api/v2/${address}/erc20?chain=${chain}`,
            {
                headers: {
                    'X-API-Key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjgxMGQ2Y2U1LThhMGYtNDdmMS1hOTZmLWQ0N2IyYTViZmJhNiIsIm9yZ0lkIjoiNDMyMDUzIiwidXNlcklkIjoiNDQ0NDI2IiwidHlwZUlkIjoiMzMzYTk5ODgtMDllYy00Y2E1LWE2ZjEtOTQ5NmQyMWU5YjFhIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3Mzk4MDI0OTMsImV4cCI6NDg5NTU2MjQ5M30.4IOB44VohV4KAtZgDwvDztojsqIfPpCm0bTCUHxqp18' // Você precisa se registrar em https://moralis.io/
                }
            }
        );

        if (!response.ok) throw new Error('Erro ao buscar tokens');
        
        const tokens = await response.json();
        return tokens;
    } catch (error) {
        console.error("Erro ao buscar tokens:", error);
        return [];
    }
}

// Função para salvar token personalizado
function saveCustomToken(chainId, tokenData) {
    const key = `custom-tokens-${chainId}`;
    let tokens = JSON.parse(localStorage.getItem(key) || '[]');
    
    // Verifica se o token já existe
    const exists = tokens.some(t => t.address.toLowerCase() === tokenData.address.toLowerCase());
    if (!exists) {
        tokens.push(tokenData);
        localStorage.setItem(key, JSON.stringify(tokens));
    }
}

// Função para carregar tokens personalizados
function getCustomTokens(chainId) {
    const key = `custom-tokens-${chainId}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
}

// Função para verificar e carregar informações do token
async function checkToken(address) {
    try {
        const tokenContract = new web3.eth.Contract([
            {
                "constant": true,
                "inputs": [],
                "name": "name",
                "outputs": [{"name": "", "type": "string"}],
                "type": "function"
            },
            {
                "constant": true,
                "inputs": [],
                "name": "symbol",
                "outputs": [{"name": "", "type": "string"}],
                "type": "function"
            },
            {
                "constant": true,
                "inputs": [],
                "name": "decimals",
                "outputs": [{"name": "", "type": "uint8"}],
                "type": "function"
            }
        ], address);

        const [name, symbol, decimals] = await Promise.all([
            tokenContract.methods.name().call(),
            tokenContract.methods.symbol().call(),
            tokenContract.methods.decimals().call()
        ]);

        return { name, symbol, decimals, address };
    } catch (error) {
        throw new Error('Token inválido');
    }
}

// Função para buscar saldo de um token específico
async function getTokenBalance(tokenAddress, walletAddress) {
    const tokenContract = new web3.eth.Contract([
        {
            "constant": true,
            "inputs": [{"name": "_owner", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "balance", "type": "uint256"}],
            "type": "function"
        }
    ], tokenAddress);

    return await tokenContract.methods.balanceOf(walletAddress).call();
}

// Função para remover token personalizado
function removeCustomToken(chainId, tokenAddress) {
    const key = `custom-tokens-${chainId}`;
    let tokens = JSON.parse(localStorage.getItem(key) || '[]');
    
    // Filtra o token a ser removido
    tokens = tokens.filter(t => t.address.toLowerCase() !== tokenAddress.toLowerCase());
    localStorage.setItem(key, JSON.stringify(tokens));
}

// Atualiza a parte do updateBalances que mostra os tokens personalizados
async function updateBalances(address) {
    const balancesDiv = document.getElementById("balances");
    balancesDiv.innerHTML = `
        <div class="loading-container" id="balanceLoading">
            <div class="loading-spinner"></div>
            <p>Carregando saldos...</p>
        </div>
    `;

    try {
        const chainId = await web3.eth.getChainId();
        const networkName = await getNetworkName(chainId);
        
        // Cria container para todos os saldos
        balancesDiv.innerHTML = `
            <div class="network-info">
                <strong>Rede:</strong> ${networkName}
            </div>
            <div class="tokens-container">
                <div id="nativeToken" class="loading-container">
                    <div class="loading-spinner"></div>
                </div>
                <div class="tokens-header">
                    <h3>Tokens Personalizados</h3>
                    <button id="addTokenButton">+ Adicionar Token</button>
                </div>
                <div id="customTokens"></div>
            </div>
        `;

        // Busca saldo nativo
        const balance = await web3.eth.getBalance(address);
        const formattedBalance = web3.utils.fromWei(balance, 'ether');
        const tokenInfo = await getTokenInfo(chainId);
        const tokenPrice = await getTokenPrice(tokenInfo.coingeckoId);
        const usdValue = tokenPrice 
            ? (parseFloat(formattedBalance) * tokenPrice).toFixed(2)
            : null;

        // Atualiza saldo nativo
        const nativeTokenDiv = document.getElementById("nativeToken");
        nativeTokenDiv.className = "balance-item";
        if (usdValue) {
            nativeTokenDiv.innerHTML = `
                <div class="token-info">
                    <span class="token-symbol">${tokenInfo.symbol}</span>
                    <span class="token-balance">${formattedBalance}</span>
                    <span class="token-value">($${usdValue})</span>
                </div>
            `;
        } else {
            nativeTokenDiv.innerHTML = `
                <div class="token-info">
                    <span class="token-symbol">${tokenInfo.symbol}</span>
                    <span class="token-balance">${formattedBalance}</span>
                </div>
            `;
        }

        // Busca tokens personalizados
        const customTokens = getCustomTokens(chainId);
        const customTokensDiv = document.getElementById("customTokens");
        
        if (customTokens.length === 0) {
            customTokensDiv.innerHTML = "<p class='no-tokens'>Nenhum token personalizado adicionado</p>";
        } else {
            customTokensDiv.innerHTML = "";
            for (const token of customTokens) {
                try {
                    const balance = await getTokenBalance(token.address, address);
                    const formattedBalance = (balance / Math.pow(10, token.decimals)).toFixed(4);
                    
                    const tokenElement = document.createElement("div");
                    tokenElement.className = "balance-item";
                    tokenElement.innerHTML = `
                        <div class="token-info">
                            <span class="token-symbol">${token.symbol}</span>
                            <span class="token-balance">${formattedBalance}</span>
                            <button class="remove-token" title="Remover token">
                                <span class="remove-icon">×</span>
                            </button>
                        </div>
                    `;

                    // Adiciona evento de clique no botão de remover
                    const removeButton = tokenElement.querySelector('.remove-token');
                    removeButton.addEventListener('click', async () => {
                        if (confirm(`Deseja remover o token ${token.symbol}?`)) {
                            removeCustomToken(chainId, token.address);
                            await updateBalances(address);
                        }
                    });

                    customTokensDiv.appendChild(tokenElement);
                } catch (error) {
                    console.error(`Erro ao buscar saldo do token ${token.symbol}:`, error);
                }
            }
        }

    } catch (error) {
        balancesDiv.innerHTML = "<p>Erro ao buscar saldos</p>";
        console.error("Erro ao buscar saldos:", error);
    }

    // Adiciona evento para o botão de adicionar token
    document.getElementById("addTokenButton").addEventListener("click", showAddTokenModal);
}

// Funções para gerenciar o modal
function showAddTokenModal() {
    document.getElementById("addTokenModal").classList.remove("hidden");
    document.getElementById("tokenAddress").value = "";
    document.getElementById("confirmAddToken").disabled = true;
    document.querySelector(".token-preview").classList.add("hidden");
    document.querySelector(".error-message").classList.add("hidden");
}

function hideAddTokenModal() {
    document.getElementById("addTokenModal").classList.add("hidden");
}

// Adiciona os event listeners necessários
document.addEventListener("DOMContentLoaded", async () => {
    const storedAddress = getStoredWalletAddress();
    
    if (storedAddress && typeof window.ethereum !== "undefined") {
        // Se temos um endereço salvo e a Metamask está instalada
        web3 = new Web3(window.ethereum);
        updateConnectButton(true);
        
        try {
            // Verifica se ainda temos acesso à conta
            const accounts = await window.ethereum.request({ method: "eth_accounts" });
            if (accounts.length > 0 && accounts[0].toLowerCase() === storedAddress.toLowerCase()) {
                // Se a conta ainda está disponível e é a mesma
                document.getElementById("walletInfo").classList.remove("hidden");
                // Esconde o loading e mostra as informações
                document.getElementById("addressLoading").classList.add("hidden");
                document.getElementById("addressInfo").classList.remove("hidden");
                document.getElementById("walletAddress").textContent = storedAddress;
                
                await updateBalances(storedAddress);
                
                // Adiciona listener para mudança de rede
                window.ethereum.on("chainChanged", () => window.location.reload());
            } else {
                // Se não temos mais acesso à conta, limpa o localStorage
                localStorage.removeItem('walletAddress');
                updateConnectButton(false);
            }
        } catch (error) {
            console.error("Erro ao verificar conta:", error);
            // Em caso de erro, esconde o loading e limpa o localStorage
            document.getElementById("addressLoading").classList.add("hidden");
            localStorage.removeItem('walletAddress');
            updateConnectButton(false);
        }
    }

    const tokenAddressInput = document.getElementById("tokenAddress");
    const confirmButton = document.getElementById("confirmAddToken");
    
    tokenAddressInput.addEventListener("input", async () => {
        const address = tokenAddressInput.value.trim();
        const errorMessage = document.querySelector(".error-message");
        const tokenPreview = document.querySelector(".token-preview");
        
        if (web3.utils.isAddress(address)) {
            try {
                const tokenInfo = await checkToken(address);
                document.getElementById("tokenName").textContent = tokenInfo.name;
                document.getElementById("tokenSymbol").textContent = tokenInfo.symbol;
                document.getElementById("tokenDecimals").textContent = tokenInfo.decimals;
                
                tokenPreview.classList.remove("hidden");
                errorMessage.classList.add("hidden");
                confirmButton.disabled = false;
            } catch (error) {
                errorMessage.textContent = "Endereço inválido ou não é um token ERC20";
                errorMessage.classList.remove("hidden");
                tokenPreview.classList.add("hidden");
                confirmButton.disabled = true;
            }
        } else {
            errorMessage.textContent = "Endereço inválido";
            errorMessage.classList.remove("hidden");
            tokenPreview.classList.add("hidden");
            confirmButton.disabled = true;
        }
    });

    document.getElementById("cancelAddToken").addEventListener("click", hideAddTokenModal);
    
    document.getElementById("confirmAddToken").addEventListener("click", async () => {
        const address = tokenAddressInput.value.trim();
        try {
            const tokenInfo = await checkToken(address);
            const chainId = await web3.eth.getChainId();
            saveCustomToken(chainId, tokenInfo);
            hideAddTokenModal();
            
            // Atualiza a lista de tokens
            const walletAddress = document.getElementById("walletAddress").textContent;
            await updateBalances(walletAddress);
        } catch (error) {
            console.error("Erro ao adicionar token:", error);
        }
    });

    // Atualiza o HTML do modal
    document.getElementById('addTaskModal').querySelector('.modal-body').innerHTML = `
        <div class="input-group">
            <label for="taskTitle">Título:</label>
            <input type="text" id="taskTitle" placeholder="Digite o título da tarefa">
        </div>
        <div class="input-group">
            <label for="taskLink">Link (opcional):</label>
            <input type="url" id="taskLink" placeholder="https://...">
        </div>
    `;

    // Inicializa a lista de tarefas
    updateTaskList();

    // Inicializa os widgets
    updateRemindersCarousel();
    updateToolsGrid();

    // Event listeners para o modal de lembretes
    document.getElementById('addReminderButton').addEventListener('click', () => {
        document.getElementById('addReminderModal').classList.remove('hidden');
        // Define a data mínima como agora
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 16); // Formato YYYY-MM-DDTHH:mm
        document.getElementById('reminderDate').min = dateStr;
        document.getElementById('reminderDate').value = dateStr;
    });

    document.getElementById('cancelAddReminder').addEventListener('click', () => {
        document.getElementById('addReminderModal').classList.add('hidden');
    });

    document.getElementById('confirmAddReminder').addEventListener('click', () => {
        const title = document.getElementById('reminderTitle').value.trim();
        const date = document.getElementById('reminderDate').value;
        const priority = document.getElementById('reminderPriority').value;

        if (title && date) {
            const reminders = getReminders();
            reminders.push({
                id: Date.now(),
                title,
                date,
                priority,
                completed: false
            });
            saveReminders(reminders);
            updateRemindersCarousel();
            document.getElementById('addReminderModal').classList.add('hidden');
        }
    });

    // Event listeners para o modal de ferramentas
    document.getElementById('addToolButton').addEventListener('click', () => {
        document.getElementById('addToolModal').classList.remove('hidden');
    });

    document.getElementById('cancelAddTool').addEventListener('click', () => {
        document.getElementById('addToolModal').classList.add('hidden');
    });

    document.getElementById('confirmAddTool').addEventListener('click', () => {
        const title = document.getElementById('toolTitle').value.trim();
        const url = document.getElementById('toolUrl').value.trim();

        if (title && url) {
            const tools = getTools();
            tools.push({
                id: Date.now(),
                title,
                url
            });
            saveTools(tools);
            updateToolsGrid();
            document.getElementById('addToolModal').classList.add('hidden');
            
            // Limpa os campos
            document.getElementById('toolTitle').value = '';
            document.getElementById('toolUrl').value = '';
        }
    });

    // Adiciona eventos para os botões de ação dos lembretes
    document.querySelector('.reminders-carousel').addEventListener('click', (e) => {
        const completeBtn = e.target.closest('.complete-reminder');
        const deleteBtn = e.target.closest('.delete-reminder');
        
        if (completeBtn) {
            const reminderId = parseInt(completeBtn.dataset.id);
            const reminders = getReminders();
            const reminderIndex = reminders.findIndex(r => r.id === reminderId);
            if (reminderIndex !== -1) {
                reminders[reminderIndex].completed = true;
                saveReminders(reminders);
                updateRemindersCarousel();
            }
        }
        
        if (deleteBtn) {
            const reminderId = parseInt(deleteBtn.dataset.id);
            if (confirm('Tem certeza que deseja excluir este lembrete?')) {
                const reminders = getReminders().filter(r => r.id !== reminderId);
                saveReminders(reminders);
                updateRemindersCarousel();
            }
        }
    });

    // Inicializa o tema
    loadTheme();

    // Adiciona evento para alternar tema
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Event listener para adicionar tarefa/subitem
    document.getElementById('confirmAddTask').addEventListener('click', () => {
        const title = document.getElementById('taskTitle').value.trim();
        const link = document.getElementById('taskLink').value.trim();
        const isSubtask = document.getElementById('confirmAddTask').dataset.isSubtask === 'true';
        const parentId = document.getElementById('confirmAddTask').dataset.parentId;

        if (title) {
            const tasks = getTasks();
            if (isSubtask && parentId) {
                // Adiciona subitem
                const taskIndex = tasks.findIndex(t => t.id === parseInt(parentId));
                if (taskIndex !== -1) {
                    if (!tasks[taskIndex].subtasks) {
                        tasks[taskIndex].subtasks = [];
                    }
                    tasks[taskIndex].subtasks.push({
                        id: Date.now(),
                        title,
                        link
                    });
                }
            } else {
                // Adiciona tarefa principal
                tasks.push({
                    id: Date.now(),
                    title,
                    link,
                    subtasks: []
                });
            }
            saveTasks(tasks);
            updateTaskList();
            hideAddTaskModal();
            
            // Limpa os campos
            document.getElementById('taskTitle').value = '';
            document.getElementById('taskLink').value = '';
        }
    });

    // Event listener para abrir o modal de adicionar tarefa
    document.getElementById('addTaskButton').addEventListener('click', () => {
        showAddTaskModal(false, null);
    });

    // Event listener para fechar o modal
    document.getElementById('cancelAddTask').addEventListener('click', hideAddTaskModal);
});

document.getElementById("connectWallet").addEventListener("click", connectWallet);

// Função para salvar o endereço no localStorage
function saveWalletAddress(address) {
    localStorage.setItem('walletAddress', address);
}

// Função para carregar o endereço do localStorage
function getStoredWalletAddress() {
    return localStorage.getItem('walletAddress');
}

// Função para atualizar o texto do botão
function updateConnectButton(isReconnect = false) {
    const button = document.getElementById("connectWallet");
    button.textContent = isReconnect ? "Reconectar Carteira" : "Conectar Metamask";
}

// Funções para gerenciar tarefas
function saveTasks(tasks) {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

function getTasks() {
    return JSON.parse(localStorage.getItem('tasks') || '[]');
}

function createTaskElement(task) {
    const taskElement = document.createElement('div');
    taskElement.className = 'task-item';
    taskElement.innerHTML = `
        <div class="task-header">
            <div class="task-title">
                <i class="fas fa-chevron-right task-expand-icon"></i>
                <span>${task.title}</span>
            </div>
            <div class="task-actions">
                ${task.link ? `
                    <a href="${task.link}" target="_blank" class="task-link">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                ` : ''}
                <button class="add-subtask" title="Adicionar subitem">
                    <i class="fas fa-plus"></i>
                </button>
                <button class="delete-task" title="Excluir tarefa">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        <div class="task-content">
            <div class="subtasks-list">
                ${task.subtasks ? task.subtasks.map(subtask => `
                    <div class="subtask-item">
                        <div class="subtask-content">
                            <i class="fas fa-thumbtack subtask-icon"></i>
                            <span>${subtask.title}</span>
                            ${subtask.link ? `
                                <a href="${subtask.link}" target="_blank" class="subtask-link">
                                    <i class="fas fa-external-link-alt"></i>
                                </a>
                            ` : ''}
                        </div>
                        <button class="delete-subtask" data-id="${subtask.id}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `).join('') : ''}
            </div>
        </div>
    `;

    // Adiciona evento de expansão
    const header = taskElement.querySelector('.task-header');
    header.addEventListener('click', (e) => {
        if (!e.target.closest('.task-actions')) {
            taskElement.classList.toggle('expanded');
        }
    });

    // Adiciona evento para adicionar subitem
    const addSubtaskButton = taskElement.querySelector('.add-subtask');
    addSubtaskButton.addEventListener('click', (e) => {
        e.stopPropagation();
        showAddTaskModal(true, task.id);
    });

    // Adiciona evento de exclusão de subtask
    taskElement.querySelectorAll('.delete-subtask').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const subtaskId = button.dataset.id;
            if (confirm('Tem certeza que deseja excluir este subitem?')) {
                const tasks = getTasks();
                const taskIndex = tasks.findIndex(t => t.id === task.id);
                tasks[taskIndex].subtasks = tasks[taskIndex].subtasks.filter(st => st.id !== parseInt(subtaskId));
                saveTasks(tasks);
                updateTaskList();
            }
        });
    });

    // Adiciona evento de exclusão
    const deleteButton = taskElement.querySelector('.delete-task');
    deleteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Tem certeza que deseja excluir esta tarefa?')) {
            const tasks = getTasks();
            const updatedTasks = tasks.filter(t => t.id !== task.id);
            saveTasks(updatedTasks);
            updateTaskList();
        }
    });

    return taskElement;
}

function updateTaskList() {
    const taskList = document.getElementById('taskList');
    const tasks = getTasks();
    
    taskList.innerHTML = '';
    tasks.forEach(task => {
        taskList.appendChild(createTaskElement(task));
    });
}

// Atualiza a função showAddTaskModal para suportar subitens
function showAddTaskModal(isSubtask = false, parentId = null) {
    document.getElementById('addTaskModal').classList.remove('hidden');
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskLink').value = '';
    
    const confirmButton = document.getElementById('confirmAddTask');
    confirmButton.dataset.isSubtask = isSubtask;
    confirmButton.dataset.parentId = parentId;
}

function hideAddTaskModal() {
    document.getElementById('addTaskModal').classList.add('hidden');
}

// Funções para gerenciar lembretes
function saveReminders(reminders) {
    localStorage.setItem('reminders', JSON.stringify(reminders));
}

function getReminders() {
    return JSON.parse(localStorage.getItem('reminders') || '[]');
}

function updateRemindersCarousel() {
    const carousel = document.querySelector('.reminders-carousel');
    const reminders = getReminders()
        .filter(r => !r.completed)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (reminders.length === 0) {
        carousel.innerHTML = '<p class="no-reminders">Nenhum lembrete</p>';
        return;
    }

    let currentIndex = 0;
    
    function showReminder() {
        const reminder = reminders[currentIndex];
        carousel.innerHTML = `
            <div class="reminder-card">
                <div class="reminder-info">
                    <div class="reminder-title">${reminder.title}</div>
                    <div class="reminder-date">${formatDate(reminder.date)}</div>
                </div>
                <span class="reminder-priority priority-${reminder.priority}">
                    ${reminder.priority.charAt(0).toUpperCase() + reminder.priority.slice(1)}
                </span>
                <div class="reminder-actions">
                    <button class="complete-reminder" data-id="${reminder.id}">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="delete-reminder" data-id="${reminder.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        currentIndex = (currentIndex + 1) % reminders.length;
    }

    showReminder();
    setInterval(showReminder, 5000); // Alterna a cada 5 segundos
}

// Funções para gerenciar ferramentas
function saveTools(tools) {
    localStorage.setItem('tools', JSON.stringify(tools));
}

function getTools() {
    return JSON.parse(localStorage.getItem('tools') || '[]');
}

function updateToolsGrid() {
    const grid = document.getElementById('toolsGrid');
    const tools = getTools();

    grid.innerHTML = tools.map(tool => `
        <div class="tool-item" onclick="window.open('${tool.url}', '_blank')">
            <img class="tool-icon" src="https://www.google.com/s2/favicons?sz=64&domain=${tool.url}" alt="${tool.title}">
            <span class="tool-title">${tool.title}</span>
            <button class="tool-delete" data-id="${tool.id}" onclick="event.stopPropagation(); deleteTool(${tool.id})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// Funções auxiliares
function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5);
}

function deleteTool(id) {
    if (confirm('Tem certeza que deseja excluir esta ferramenta?')) {
        const tools = getTools().filter(t => t.id !== id);
        saveTools(tools);
        updateToolsGrid();
    }
}

// Funções para gerenciar o tema
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Atualiza o ícone do botão
    const themeIcon = document.querySelector('#themeToggle i');
    themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
}
