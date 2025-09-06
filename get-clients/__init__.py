import azure.functions as func
import requests
import json
import os
import logging

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Python HTTP trigger function processed a request.')
    
    try:
        # Get credentials from environment variables
        access_token = os.environ.get('PLANNR_ACCESS_TOKEN')
        account_uuid = os.environ.get('PLANNR_ACCOUNT_UUID')
        
        if not access_token or not account_uuid:
            return func.HttpResponse(
                "Missing PlannrCRM credentials in configuration",
                status_code=500
            )
        
        # Set up headers for PlannrCRM API
        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {access_token}',
            'X-PLANNR-ACCOUNT-UUID': account_uuid
        }
        
        # Make request to PlannrCRM API
        url = 'https://api.plannrcrm.com/api/v1/client'
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            clients_data = response.json()
            
            # Extract client names for dropdown
            client_names = []
            if isinstance(clients_data, dict) and 'data' in clients_data:
                # If response has a 'data' wrapper
                clients = clients_data['data']
            else:
                # If response is direct array
                clients = clients_data
            
            for client in clients:
                if isinstance(client, dict):
                    # Try different possible name fields
                    name = (client.get('name') or 
                           client.get('client_name') or 
                           client.get('company_name') or 
                           client.get('title') or 
                           'Unknown Client')
                    
                    client_names.append({
                        'id': client.get('id') or client.get('uuid'),
                        'name': name
                    })
            
            return func.HttpResponse(
                json.dumps({
                    'success': True,
                    'clients': client_names,
                    'total': len(client_names)
                }),
                status_code=200,
                headers={'Content-Type': 'application/json'}
            )
        
        else:
            return func.HttpResponse(
                json.dumps({
                    'success': False,
                    'error': f'PlannrCRM API error: {response.status_code}',
                    'message': response.text
                }),
                status_code=response.status_code,
                headers={'Content-Type': 'application/json'}
            )
            
    except Exception as e:
        logging.error(f'Error: {str(e)}')
        return func.HttpResponse(
            json.dumps({
                'success': False,
                'error': 'Internal server error',
                'message': str(e)
            }),
            status_code=500,
            headers={'Content-Type': 'application/json'}
        )
