#!/bin/bash

# SGN Real Services Setup Script
# Phase 2: Multi-tier Persistence with Real Services

echo "🚀 SGN REAL SERVICES SETUP"
echo "=========================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "This script is designed for macOS. For other systems, use Docker Compose."
    echo "Run: docker-compose up -d"
    exit 1
fi

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    print_error "Homebrew is required but not installed."
    echo "Install Homebrew from: https://brew.sh/"
    exit 1
fi

print_info "Installing and starting real services for SGN..."
echo ""

# Install Redis
echo "🔥 Setting up Redis (Hot Cache Tier)..."
if ! command -v redis-server &> /dev/null; then
    print_info "Installing Redis..."
    brew install redis
else
    print_status "Redis already installed"
fi

# Start Redis
if ! pgrep -x "redis-server" > /dev/null; then
    print_info "Starting Redis server..."
    brew services start redis
    sleep 2
    if pgrep -x "redis-server" > /dev/null; then
        print_status "Redis server started successfully"
    else
        print_error "Failed to start Redis server"
        exit 1
    fi
else
    print_status "Redis server already running"
fi

# Test Redis connection
if redis-cli ping | grep -q "PONG"; then
    print_status "Redis connection test successful"
else
    print_error "Redis connection test failed"
    exit 1
fi

echo ""

# Install Neo4j
echo "🧊 Setting up Neo4j (Cold Graph Tier)..."
if ! command -v neo4j &> /dev/null; then
    print_info "Installing Neo4j..."
    brew install neo4j
else
    print_status "Neo4j already installed"
fi

# Configure Neo4j
NEO4J_CONF_DIR="/opt/homebrew/var/neo4j/conf"
if [ -d "$NEO4J_CONF_DIR" ]; then
    print_info "Configuring Neo4j..."
    
    # Set initial password
    if [ ! -f "$NEO4J_CONF_DIR/.password_set" ]; then
        print_info "Setting Neo4j initial password..."
        neo4j-admin dbms set-initial-password sgnpassword
        touch "$NEO4J_CONF_DIR/.password_set"
        print_status "Neo4j password set to 'sgnpassword'"
    fi
fi

# Start Neo4j
if ! pgrep -f "neo4j" > /dev/null; then
    print_info "Starting Neo4j server..."
    brew services start neo4j
    sleep 5
    
    # Wait for Neo4j to be ready
    print_info "Waiting for Neo4j to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:7474 > /dev/null; then
            print_status "Neo4j server started successfully"
            break
        fi
        sleep 2
        if [ $i -eq 30 ]; then
            print_error "Neo4j server failed to start within 60 seconds"
            exit 1
        fi
    done
else
    print_status "Neo4j server already running"
fi

echo ""

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
if [ -f "package.json" ]; then
    npm install
    if [ $? -eq 0 ]; then
        print_status "Node.js dependencies installed successfully"
    else
        print_error "Failed to install Node.js dependencies"
        exit 1
    fi
else
    print_error "package.json not found. Make sure you're in the sgn-poc directory."
    exit 1
fi

echo ""

# Create real services demo
echo "🎯 Creating real services demo..."
cat > src/real-services-demo.mjs << 'EOF'
/**
 * SGN Real Services Demo
 * Phase 2: Multi-tier Persistence with REAL services
 * 
 * Uses:
 * - Real Redis for hot caching
 * - Real Neo4j for graph storage
 * - Real SQLite for warm storage
 */

import { KnowledgeUnit, KU_TYPES, SEVERITY_LEVELS } from './knowledge-unit.mjs';
import { generateKeyPair } from './crypto.mjs';
import { MultiTierStorage } from './persistence/multi-tier-storage.mjs';
import { RedisStorageTierReal } from './persistence/redis-storage-tier-real.mjs';
import { Neo4jStorageTierReal } from './persistence/neo4j-storage-tier-real.mjs';
import { reputationManager } from './reputation-manager.mjs';

console.log("🔥 SGN REAL SERVICES DEMO");
console.log("=".repeat(50));
console.log("Using REAL Redis + Neo4j + SQLite");
console.log("");

async function runRealServicesDemo() {
    try {
        // Test Redis connection
        console.log("🔥 Testing Redis connection...");
        const redisTest = new RedisStorageTierReal();
        await redisTest.initialize();
        await redisTest.cleanup();
        console.log("✅ Redis connection successful");
        
        // Test Neo4j connection
        console.log("🧊 Testing Neo4j connection...");
        const neo4jTest = new Neo4jStorageTierReal();
        await neo4jTest.initialize();
        await neo4jTest.cleanup();
        console.log("✅ Neo4j connection successful");
        
        console.log("");
        console.log("🎉 ALL REAL SERVICES ARE READY!");
        console.log("You can now run the full multi-tier demo with real services.");
        console.log("");
        console.log("Next steps:");
        console.log("1. Run: node src/multi-tier-persistence-demo-real.mjs");
        console.log("2. Open multiple terminals for multi-node testing");
        console.log("3. Monitor services:");
        console.log("   - Redis: redis-cli monitor");
        console.log("   - Neo4j: http://localhost:7474 (neo4j/sgnpassword)");
        
    } catch (error) {
        console.error("❌ Real services test failed:", error);
        console.log("");
        console.log("Troubleshooting:");
        console.log("- Check if Redis is running: brew services list | grep redis");
        console.log("- Check if Neo4j is running: brew services list | grep neo4j");
        console.log("- Restart services: brew services restart redis neo4j");
    }
}

runRealServicesDemo();
EOF

print_status "Real services demo created"

echo ""

# Service status check
echo "📊 SERVICE STATUS CHECK"
echo "======================"

# Redis status
if pgrep -x "redis-server" > /dev/null; then
    print_status "Redis: Running on port 6379"
    REDIS_MEMORY=$(redis-cli info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    echo "   Memory usage: $REDIS_MEMORY"
else
    print_error "Redis: Not running"
fi

# Neo4j status
if pgrep -f "neo4j" > /dev/null; then
    print_status "Neo4j: Running on ports 7474 (HTTP) and 7687 (Bolt)"
    echo "   Web interface: http://localhost:7474"
    echo "   Username: neo4j, Password: sgnpassword"
else
    print_error "Neo4j: Not running"
fi

# SQLite status
if [ -f "src/db/sgn-multi-tier.db" ]; then
    print_status "SQLite: Database file exists"
else
    print_info "SQLite: Database will be created on first use"
fi

echo ""
echo "🎯 SETUP COMPLETE!"
echo "=================="
echo ""
echo "Your SGN system now has:"
echo "🔥 Redis - Hot cache tier (in-memory)"
echo "🔶 SQLite - Warm storage tier (local disk)"
echo "🧊 Neo4j - Cold graph tier (graph database)"
echo ""
echo "Test the setup:"
echo "node src/real-services-demo.mjs"
echo ""
echo "Run full demo with real services:"
echo "node src/multi-tier-persistence-demo-real.mjs"
echo ""
echo "Monitor services:"
echo "- Redis: redis-cli monitor"
echo "- Neo4j: open http://localhost:7474"
echo "- Logs: tail -f /opt/homebrew/var/log/redis.log"
echo ""
print_status "Ready for 100% real data testing!"
