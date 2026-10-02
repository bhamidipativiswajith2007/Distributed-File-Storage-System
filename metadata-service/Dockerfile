FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy the root package.json and package-lock.json
COPY package*.json ./

# Copy the shared common folder and the metadata-service folder
COPY common ./common
COPY metadata-service ./metadata-service

# Install all dependencies (NPM workspaces will link them automatically)
RUN npm install

# Move into the specific service folder to run it
WORKDIR /app/metadata-service

# Expose port 5000 for the Metadata Service
EXPOSE 5000

# Start the server
CMD ["npm", "start"]
