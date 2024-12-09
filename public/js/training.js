// Training Form Functions
function openTrainingForm() {
    const modal = document.getElementById('trainingModal');
    modal.innerHTML = `
        <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div class="mt-3">
                <h3 class="text-lg font-medium text-gray-900 mb-4">Training Form</h3>
                
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Trainee Usernames (comma separated)</label>
                    <textarea id="traineeUsernames" rows="2" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="username1, username2, ..."></textarea>
                </div>

                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Training Type</label>
                    <select id="trainingType" onchange="updateXPOptions()" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                        <option value="">Select Type</option>
                        <option value="Basic Training">Basic Training</option>
                        <option value="Training">Training</option>
                        <option value="Event">Event</option>
                        <option value="Raid">Raid</option>
                    </select>
                </div>

                <div id="xpSection" class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">XP Amount</label>
                    <div id="xpInput"></div>
                    <p id="approvalNote" class="text-sm text-red-600 mt-1 hidden">* This XP amount will require approval</p>
                </div>

                <div class="flex justify-end gap-2">
                    <button onclick="closeTrainingModal()" 
                            class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
                        Cancel
                    </button>
                    <button onclick="submitTraining()" 
                            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                        Sign & Submit
                    </button>
                </div>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
}

function updateXPOptions() {
    const type = document.getElementById('trainingType').value;
    const xpInput = document.getElementById('xpInput');
    const approvalNote = document.getElementById('approvalNote');

    switch(type) {
        case 'Basic Training':
            xpInput.innerHTML = `
                <input type="number" value="1" disabled
                       class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100">
            `;
            approvalNote.classList.add('hidden');
            break;
        case 'Training':
            xpInput.innerHTML = `
                <select class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                    ${[1,2,3,4,5].map(num => `<option value="${num}">${num} XP</option>`).join('')}
                </select>
            `;
            approvalNote.classList.add('hidden');
            break;
        case 'Event':
        case 'Raid':
            xpInput.innerHTML = `
                <input type="number" min="1" 
                       class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                       onchange="checkApprovalNeeded(this.value)">
            `;
            break;
        default:
            xpInput.innerHTML = '';
            approvalNote.classList.add('hidden');
    }
}

function checkApprovalNeeded(xp) {
    const approvalNote = document.getElementById('approvalNote');
    if (xp >= 10) {
        approvalNote.classList.remove('hidden');
    } else {
        approvalNote.classList.add('hidden');
    }
}

// Approval Functions
function openTrainingApproval() {
    const modal = document.getElementById('trainingApprovalModal');
    loadPendingTrainings();
    modal.classList.remove('hidden');
}

async function loadPendingTrainings() {
    try {
        const response = await fetch('/api/trainings/pending');
        const data = await response.json();
        const container = document.getElementById('pendingTrainingsList');
        
        if (data.trainings.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500">No pending trainings</p>';
            return;
        }

        container.innerHTML = data.trainings.map(training => `
            <div class="bg-white p-4 rounded-lg shadow mb-4">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-semibold">${training.type}</p>
                        <p class="text-sm text-gray-600">Instructor: ${training.instructor.username}</p>
                        <p class="text-sm text-gray-600">XP Amount: ${training.xpAmount}</p>
                        <p class="text-sm text-gray-600">Trainees: ${training.trainees.map(t => t.username).join(', ')}</p>
                        ${training.status === 'bumped_back' ? 
                            `<p class="text-sm text-red-600">* Bumped back from Officer Review</p>` : ''}
                    </div>
                    <div class="space-y-2">
                        <button onclick="handleTrainingAction('${training._id}', 'approve')" 
                                class="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                            Approve
                        </button>
                        <button onclick="handleTrainingAction('${training._id}', 'bump_up')"
                                class="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                            Bump Up
                        </button>
                        <button onclick="openRejectTrainingModal('${training._id}')"
                                class="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                            Reject
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading pending trainings:', error);
    }
}

// Training Logs Functions
function openTrainingLogs() {
    const modal = document.getElementById('trainingLogsModal');
    loadTrainingLogs('all');
    modal.classList.remove('hidden');
}

async function loadTrainingLogs(filter = 'all') {
    try {
        const response = await fetch(`/api/trainings/logs?filter=${filter}`);
        const data = await response.json();
        const tbody = document.getElementById('trainingLogsBody');

        tbody.innerHTML = data.trainings.map(training => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">${new Date(training.createdAt).toLocaleDateString()}</td>
                <td class="px-6 py-4 whitespace-nowrap">${training.type}</td>
                <td class="px-6 py-4 whitespace-nowrap">${training.instructor.username}</td>
                <td class="px-6 py-4 whitespace-nowrap">${training.trainees.map(t => t.username).join(', ')}</td>
                <td class="px-6 py-4 whitespace-nowrap">${training.xpAmount}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="${getStatusClass(training.status)}">${training.status}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <button onclick="showTrainingDetails('${training._id}')"
                            class="text-blue-600 hover:text-blue-800">
                        View Details
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading training logs:', error);
    }
}

// Utility Functions
function getStatusClass(status) {
    return {
        'pending': 'text-yellow-600',
        'approved': 'text-green-600',
        'rejected': 'text-red-600',
        'bumped_up': 'text-blue-600',
        'bumped_back': 'text-orange-600'
    }[status] || 'text-gray-600';
}

async function handleTrainingAction(trainingId, action) {
    try {
        const response = await fetch(`/api/trainings/${trainingId}/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (data.success) {
            loadPendingTrainings();
        } else {
            alert(data.error || 'Error processing action');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error processing action');
    }
}

// Close Modal Functions
function closeTrainingModal() {
    document.getElementById('trainingModal').classList.add('hidden');
}

function closeTrainingApprovalModal() {
    document.getElementById('trainingApprovalModal').classList.add('hidden');
}

function closeTrainingLogsModal() {
    document.getElementById('trainingLogsModal').classList.add('hidden');
}