FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy the root package.json and package-lock.json
COPY package*.json ./

# Copy the shared common folder and the storage-node folder
COPY common ./common
COPY storage-node ./storage-node

# Install all dependencies
RUN npm install

# Move into the specific service folder to run it
WORKDIR /app/storage-node

# Expose a default port (this will be overridden by docker-compose)
EXPOSE 5001

# Start the server
CMD ["npm", "start"]
